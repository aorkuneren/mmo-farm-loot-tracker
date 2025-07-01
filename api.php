<?php
// api.php

session_start(); // PHP oturumunu başlat
require_once 'db.php'; // Veritabanı bağlantısını dahil et

// JSON yanıtı döndürmek için başlığı ayarla
header('Content-Type: application/json');

$response = ['success' => false, 'message' => 'Geçersiz API isteği.'];
$requestMethod = $_SERVER['REQUEST_METHOD']; // Gelen isteğin metodunu al (GET, POST vb.)
$isAdmin = isset($_SESSION['role']) && $_SESSION['role'] === 'admin'; // Kullanıcının yönetici olup olmadığını kontrol et

// GET ve POST verilerini birleştirilmiş bir 'input' değişkenine al
// POST istekleri için JSON body (application/json) veya form-data (application/x-www-form-urlencoded) desteklenir.
$input = json_decode(file_get_contents('php://input'), true);
if (empty($input) && $requestMethod === 'POST') {
    $input = $_POST; // Eğer JSON body yoksa, $_POST verilerini kullan
}
// 'action' parametresini GET veya POST'tan al
$action = $input['action'] ?? $_GET['action'] ?? '';

// Herkesin erişebileceği (public) API uç noktalarını tanımla
// Şu an için sadece GET ile veri okuma işlemleri public olabilir.
$publicEndpoints = [
    'GET' => [
        'getGroups', 'getGroupDetail', 'getPlayers', 'report', 'getPaidAmounts', 'getGlobalPlayerReceivables'
    ]
];

// Mevcut isteğin public olup olmadığını kontrol et
$isPublicAccess = isset($publicEndpoints[$requestMethod]) && in_array($action, $publicEndpoints[$requestMethod]);

// Eğer kullanıcı yönetici değilse ve istek public bir endpoint değilse, yetkisiz yanıt dön
if (!$isAdmin && !$isPublicAccess) {
    $response['message'] = 'Yetkiniz yok veya giriş yapmalısınız.';
    echo json_encode($response);
    exit(); // Yetkisiz isteği burada sonlandır
}

try {
    // 'action' parametresine göre farklı işlemleri yap
    switch ($action) {
        // --- GRUP İŞLEMLERİ ---
        case 'createGroup':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.'); // Sadece yöneticiler grup oluşturabilir
            $name = $input['name'] ?? '';
            $playerNames = $input['players'] ?? [];

            if (empty($name) || !is_array($playerNames) || empty($playerNames)) {
                throw new Exception('Grup adı ve oyuncular gereklidir.');
            }

            $pdo->beginTransaction(); // İşlemi başlat (atomik işlem için)

            // Grup oluştur
            $stmt = $pdo->prepare("INSERT INTO groups (name) VALUES (?)");
            $stmt->execute([$name]);
            $groupId = $pdo->lastInsertId(); // Yeni oluşturulan grubun ID'sini al

            // Grup üyelerini ekle
            foreach ($playerNames as $playerName) {
                // Oyuncu yoksa 'players' tablosuna ekle, varsa mevcut ID'sini al
                $stmt = $pdo->prepare("INSERT OR IGNORE INTO players (name) VALUES (?)");
                $stmt->execute([$playerName]);

                // Oyuncunun ID'sini al
                $stmt = $pdo->prepare("SELECT id FROM players WHERE name = ?");
                $stmt->execute([$playerName]);
                $playerId = $stmt->fetchColumn();

                // 'group_members' tablosuna grup ve oyuncu ilişkisini ekle
                $stmt = $pdo->prepare("INSERT INTO group_members (group_id, player_id) VALUES (?, ?)");
                $stmt->execute([$groupId, $playerId]);
            }
            $pdo->commit(); // İşlemi tamamla ve değişiklikleri kaydet
            $response = ['success' => true, 'message' => 'Grup başarıyla oluşturuldu.', 'groupId' => $groupId];
            break;

        case 'getGroups': // Tüm grupları listele
            $stmt = $pdo->query("SELECT id, name, created_at FROM groups ORDER BY created_at DESC");
            $groups = $stmt->fetchAll();

            // Her grup için oyuncu ve item sayılarını ekle (performans için ayrı sorgular kullanılabilir, veya JOIN ile tek sorgu da yazılabilir)
            foreach ($groups as &$group) { // '&' ile referansla, direkt orijinal diziyi güncelle
                $stmt = $pdo->prepare("SELECT COUNT(player_id) FROM group_members WHERE group_id = ?");
                $stmt->execute([$group['id']]);
                $group['player_count'] = $stmt->fetchColumn();

                $stmt = $pdo->prepare("SELECT COUNT(id) FROM items WHERE group_id = ?");
                $stmt->execute([$group['id']]);
                $group['item_count'] = $stmt->fetchColumn();
            }
            $response = ['success' => true, 'groups' => $groups];
            break;

        case 'getGroupDetail': // Belirli bir grubun detaylarını çek
            $groupId = $_GET['id'] ?? null;
            if (!$groupId) throw new Exception('Grup ID gerekli.');

            // Grup bilgilerini al
            $stmt = $pdo->prepare("SELECT id, name, created_at FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('Grup bulunamadı.');

            // Gruba ait oyuncuları al
            $stmt = $pdo->prepare("SELECT p.id, p.name FROM players p JOIN group_members gm ON p.id = gm.player_id WHERE gm.group_id = ? ORDER BY p.name ASC");
            $stmt->execute([$groupId]);
            $group['players'] = $stmt->fetchAll();

            // Gruba ait itemları ve itemı satan oyuncunun adını al
            $stmt = $pdo->prepare("SELECT i.id, i.name, i.price, i.status, i.created_at as date, p.id as seller_id, p.name as seller_name FROM items i LEFT JOIN players p ON i.seller_id = p.id WHERE i.group_id = ? ORDER BY i.created_at DESC");
            $stmt->execute([$groupId]);
            $group['items'] = $stmt->fetchAll();

            $response = ['success' => true, 'group' => $group];
            break;

        case 'deleteGroup':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.');
            $groupId = $input['id'] ?? '';
            if (!$groupId) throw new Exception('Grup ID gerekli.');

            // onDelete CASCADE sayesinde, grupla ilişkili group_members, items, player_paid_amounts otomatik silinir
            $stmt = $pdo->prepare("DELETE FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $response = ['success' => true, 'message' => 'Grup başarıyla silindi.'];
            break;

        // --- GENEL OYUNCU İŞLEMLERİ ---
        case 'addGlobalPlayer':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.');
            $playerName = $input['name'] ?? '';
            if (empty($playerName)) throw new Exception('Oyuncu adı boş bırakılamaz.');

            $stmt = $pdo->prepare("INSERT INTO players (name) VALUES (?)");
            $stmt->execute([$playerName]);
            $response = ['success' => true, 'message' => 'Oyuncu başarıyla eklendi.', 'playerId' => $pdo->lastInsertId()];
            break;

        case 'getPlayers': // Tüm global oyuncuları listele
            $stmt = $pdo->query("SELECT id, name FROM players ORDER BY name ASC");
            $players = $stmt->fetchAll();
            $response = ['success' => true, 'players' => $players];
            break;

        case 'deletePlayer':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.');
            $playerId = $input['id'] ?? '';
            if (!$playerId) throw new Exception('Oyuncu ID gerekli.');

            // Oyuncunun herhangi bir gruba bağlı olup olmadığını kontrol et
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM group_members WHERE player_id = ?");
            $stmt->execute([$playerId]);
            if ($stmt->fetchColumn() > 0) {
                throw new Exception('Bu oyuncu bir veya daha fazla gruba bağlı. Önce gruplardan çıkarın.');
            }
            // Oyuncu, itemları satıcı olarak ayarlanmış olabilir, ON DELETE SET NULL bunu halleder.
            // Ödenen miktarları da silebiliriz, ON DELETE CASCADE bunu halleder.

            $stmt = $pdo->prepare("DELETE FROM players WHERE id = ?");
            $stmt->execute([$playerId]);
            $response = ['success' => true, 'message' => 'Oyuncu başarıyla silindi.'];
            break;

        // --- ITEM İŞLEMLERİ ---
        case 'saveItem':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.');
            $itemId = $input['id'] ?? null; // Eğer null ise yeni item, değilse mevcut item güncellenir
            $groupId = $input['groupId'] ?? null;
            $itemName = $input['name'] ?? '';
            $price = $input['price'] ?? null;
            $sellerId = $input['sellerId'] ?? null; // PHP'de player ID'si olarak alıyoruz
            $status = $input['status'] ?? 'pending';

            if (!$groupId || empty($itemName) || empty($status)) {
                throw new Exception('Gerekli alanlar boş bırakılamaz: grup, item adı, durum.');
            }

            if ($itemId) { // Mevcut itemı güncelle
                $stmt = $pdo->prepare("UPDATE items SET name = ?, price = ?, seller_id = ?, status = ? WHERE id = ? AND group_id = ?");
                $stmt->execute([$itemName, $price, $sellerId, $status, $itemId, $groupId]);
                $response = ['success' => true, 'message' => 'Item başarıyla güncellendi.'];
            } else { // Yeni item ekle
                $stmt = $pdo->prepare("INSERT INTO items (group_id, name, price, seller_id, status) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$groupId, $itemName, $price, $sellerId, $status]);
                $response = ['success' => true, 'message' => 'Item başarıyla eklendi.', 'itemId' => $pdo->lastInsertId()];
            }
            break;

        case 'deleteItem':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.');
            $itemId = $input['id'] ?? '';
            if (!$itemId) throw new Exception('Item ID gerekli.');

            $stmt = $pdo->prepare("DELETE FROM items WHERE id = ?");
            $stmt->execute([$itemId]);
            $response = ['success' => true, 'message' => 'Item başarıyla silindi.'];
            break;

        // --- RAPOR İŞLEMLERİ ---
        case 'report':
            $groupCount = $pdo->query("SELECT COUNT(*) FROM groups")->fetchColumn();
            $itemCount = $pdo->query("SELECT COUNT(*) FROM items")->fetchColumn();
            $totalSoldValue = $pdo->query("SELECT SUM(price) FROM items WHERE status = 'sold'")->fetchColumn() ?: 0;
            $totalPendingValue = $pdo->query("SELECT SUM(price) FROM items WHERE status != 'sold'")->fetchColumn() ?: 0;
            $totalValueAllItems = $pdo->query("SELECT SUM(price) FROM items")->fetchColumn() ?: 0;

            $response = [
                'success' => true,
                'report' => [
                    'groupCount' => $groupCount,
                    'itemCount' => $itemCount,
                    'totalSoldValue' => $totalSoldValue,
                    'totalPendingValue' => $totalPendingValue,
                    'totalValueAllItems' => $totalValueAllItems
                ]
            ];
            break;

        // --- OYUNCU ÖDENEN MİKTAR İŞLEMLERİ ---
        case 'getPaidAmounts':
            $groupId = $_GET['groupId'] ?? null;
            if (!$groupId) throw new Exception('Grup ID gerekli.');

            $stmt = $pdo->prepare("SELECT player_id, amount_paid FROM player_paid_amounts WHERE group_id = ?");
            $stmt->execute([$groupId]);
            $paidAmounts = [];
            while ($row = $stmt->fetch()) {
                $paidAmounts[$row['player_id']] = $row['amount_paid'];
            }
            $response = ['success' => true, 'paidAmounts' => $paidAmounts];
            break;

        case 'updatePaidAmount':
            if (!$isAdmin) throw new Exception('Yetkisiz işlem.');
            $groupId = $input['groupId'] ?? null;
            $playerId = $input['playerId'] ?? null;
            $amountPaid = $input['amount'] ?? null;

            if (!$groupId || !$playerId || !is_numeric($amountPaid)) {
                throw new Exception('Grup ID, oyuncu ID ve miktar gerekli.');
            }

            // Upsert işlemi: Eğer kayıt varsa güncelle, yoksa yeni kayıt ekle
            // ON CONFLICT (group_id, player_id) DO UPDATE SET amount_paid = EXCLUDED.amount_paid
            // Bu SQLite sözdizimi, benzersizlik çakışması durumunda güncelleme yapar.
            $stmt = $pdo->prepare("INSERT INTO player_paid_amounts (group_id, player_id, amount_paid) VALUES (?, ?, ?)
                                   ON CONFLICT(group_id, player_id) DO UPDATE SET amount_paid = EXCLUDED.amount_paid");
            $stmt->execute([$groupId, $playerId, $amountPaid]);
            $response = ['success' => true, 'message' => 'Verilen pay başarıyla güncellendi.'];
            break;

        // --- YENİ: GENEL OYUNCU ALACAKLARI RAPORU ---
        case 'getGlobalPlayerReceivables':
            // Step 1: Find all groups where all their items are 'sold'
            $fullySoldGroupsStmt = $pdo->query("
                SELECT g.id as group_id
                FROM groups g
                JOIN items i ON g.id = i.group_id
                GROUP BY g.id
                HAVING COUNT(i.id) = SUM(CASE WHEN i.status = 'sold' THEN 1 ELSE 0 END)
            ");
            $fullySoldGroupIds = $fullySoldGroupsStmt->fetchAll(PDO::FETCH_COLUMN);

            $playerReceivables = [];

            // Get all players (global list)
            $allPlayersStmt = $pdo->query("SELECT id, name FROM players ORDER BY name ASC");
            $allPlayers = $allPlayersStmt->fetchAll();

            foreach ($allPlayers as $player) {
                $playerId = $player['id'];
                $playerName = $player['name'];
                $totalEarned = 0;
                $totalPaid = 0;
                $groupsParticipatedIn = []; // Yeni: Oyuncunun pay aldığı grupların adlarını tutacak

                // Bu oyuncu için SADECE tüm itemları satılmış gruplardan kazançları hesapla
                if (!empty($fullySoldGroupIds)) {
                    $placeholders = implode(',', array_fill(0, count($fullySoldGroupIds), '?'));
                    $stmt = $pdo->prepare("
                        SELECT i.price, i.seller_id, gm.group_id, g.name as group_name
                        FROM items i
                        JOIN group_members gm ON i.group_id = gm.group_id AND gm.player_id = ?
                        JOIN groups g ON i.group_id = g.id
                        WHERE i.status = 'sold' AND i.group_id IN ($placeholders)
                    ");
                    // Oyuncu ID'si ve grup ID'lerini birleştirip sorguyu çalıştır
                    $params = array_merge([$playerId], $fullySoldGroupIds);
                    $stmt->execute($params);
                    $soldItemsInFullySoldGroups = $stmt->fetchAll();

                    $playerGroupNames = []; // Bu oyuncu için benzersiz grup adlarını topla
                    foreach ($soldItemsInFullySoldGroups as $item) {
                        // Pay hesaplaması için gruba ait üye sayısını al
                        $groupMembersCountStmt = $pdo->prepare("SELECT COUNT(*) FROM group_members WHERE group_id = ?");
                        $groupMembersCountStmt->execute([$item['group_id']]);
                        $groupMemberCount = $groupMembersCountStmt->fetchColumn();

                        // Satıcı bonusu (1.5 kat) ile payı tekrar hesapla
                        $base = $item['price'] / ($groupMemberCount + 0.5);
                        $playerShare = ($item['seller_id'] == $playerId) ? $base * 1.5 : $base;
                        $totalEarned += $playerShare;

                        // Grup adını daha önce eklenmemişse ekle
                        if (!in_array($item['group_name'], $playerGroupNames)) {
                            $playerGroupNames[] = $item['group_name'];
                        }
                    }
                    $groupsParticipatedIn = $playerGroupNames; // Toplanan grup adlarını ata
                }

                // Bu oyuncu için tüm gruplardaki ödenen toplam miktarı al (grubun satış durumu bağımsızdır)
                $totalPaidStmt = $pdo->prepare("SELECT SUM(amount_paid) FROM player_paid_amounts WHERE player_id = ?");
                $totalPaidStmt->execute([$playerId]);
                $totalPaid = $totalPaidStmt->fetchColumn() ?: 0;

                $playerReceivables[] = [
                    'id' => $playerId,
                    'name' => $playerName,
                    'totalEarned' => (float) $totalEarned,
                    'totalPaid' => (float) $totalPaid,
                    'groupsParticipatedIn' => $groupsParticipatedIn // Yeni: Oyuncunun dahil olduğu gruplar
                ];
            }
            $response = ['success' => true, 'receivables' => $playerReceivables];
            break;


        default:
            $response['message'] = 'Bilinmeyen API eylemi.';
            break;
    }
} catch (Exception $e) {
    // İşlem devam ederken bir hata olursa geri al
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $response['message'] = 'Hata: ' . $e->getMessage();
    // Geliştirme aşamasında hataları görmek için: $response['debug'] = $e->getTraceAsString();
}

// Son yanıtı JSON formatında geri gönder
echo json_encode($response);
?>
