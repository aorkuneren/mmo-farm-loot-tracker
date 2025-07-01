<?php
// auth.php

session_start(); // PHP oturumunu başlat. Bu, oturum değişkenlerini (örn. $_SESSION) kullanmanızı sağlar.
require_once 'db.php'; // Veritabanı bağlantısını ve PDO objesini dahil et.

// JSON yanıtı döndüreceğimizi belirtmek için HTTP başlığını ayarla.
header('Content-Type: application/json');

$response = ['success' => false, 'message' => 'Geçersiz istek.']; // Varsayılan yanıt.

// İstek yöntemini kontrol et (POST veya GET).
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // POST verilerinden 'action' parametresini al. Yoksa boş bırak.
    $action = $_POST['action'] ?? '';

    if ($action === 'login') {
        $username = $_POST['username'] ?? ''; // Kullanıcı adını al
        $password = $_POST['password'] ?? ''; // Şifreyi al

        if (empty($username) || empty($password)) {
            $response['message'] = 'Kullanıcı adı ve şifre boş bırakılamaz.';
        } else {
            // Veritabanında kullanıcıyı sorgula.
            $stmt = $pdo->prepare("SELECT id, username, password, role FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $user = $stmt->fetch(); // Kullanıcı kaydını çek

            // Kullanıcı bulunduysa ve şifre eşleşiyorsa (güvenlik uyarısı için db.php'ye bakınız)
            if ($user && $password === $user['password']) { // Gerçek uygulamada: password_verify($password, $user['password_hash'])
                // Oturum değişkenlerini ayarla
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['role'] = $user['role'];
                
                $response['success'] = true;
                $response['message'] = 'Giriş başarılı!';
                // Frontend'e kullanıcı bilgilerini gönder
                $response['user'] = ['username' => $user['username'], 'role' => $user['role']];
            } else {
                $response['message'] = 'Geçersiz kullanıcı adı veya şifre.';
            }
        }
    } elseif ($action === 'logout') {
        session_unset();   // Tüm oturum değişkenlerini (örn. $_SESSION['user_id']) kaldır
        session_destroy(); // Sunucudaki oturumu tamamen sonlandır
        $response['success'] = true;
        $response['message'] = 'Çıkış başarılı.';
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // GET isteği geldiğinde oturum durumunu kontrol et.
    // Bu, sayfa yüklendiğinde JS tarafından kullanıcının zaten giriş yapıp yapmadığını anlamak için kullanılır.
    if (isset($_SESSION['user_id'])) {
        $response['success'] = true;
        $response['message'] = 'Zaten oturum açık.';
        $response['user'] = ['username' => $_SESSION['username'], 'role' => $_SESSION['role']];
    } else {
        $response['message'] = 'Oturum açık değil.';
    }
}

// Oluşturulan JSON yanıtını istemciye geri gönder.
echo json_encode($response);
?>
