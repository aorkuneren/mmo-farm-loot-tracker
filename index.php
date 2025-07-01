<?php
// index.php

session_start(); // Oturumu başlat. PHP'nin $_SESSION süperglobalini kullanmak için gereklidir.

// Kullanıcının giriş yapıp yapmadığını ve rolünü kontrol et
$isLoggedIn = isset($_SESSION['user_id']); // user_id oturumda set edilmişse giriş yapmıştır
$isAdmin = isset($_SESSION['role']) && $_SESSION['role'] === 'admin'; // Rolü 'admin' ise yönetici
$username = $_SESSION['username'] ?? ''; // Kullanıcı adını al, yoksa boş string

?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>🗡️ MMO Farm Loot Tracker</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="MMO oyunlarında farm loot'larını takip edin ve oyuncu paylarını yönetin.">
    <meta name="keywords" content="MMO, farm, loot, tracker, oyun, envanter, grup, oyuncu, yönetim">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <!-- Font Awesome İkon Kütüphanesi (İkonlar için kullanılır) -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="toast-container"></div> <!-- Toast bildirimleri (başarılı/hata mesajları) bu div içine yerleşir -->

    <header class="app-header">
        <h1><i class="fas fa-dagger"></i> MMO Farm Loot Tracker</h1>
        <div class="auth-controls">
            <?php if ($isLoggedIn): // Kullanıcı giriş yapmışsa (yönetici) ?>
                Hoş geldin, <span class="username"><?php echo htmlspecialchars($username); ?></span> (<?php echo htmlspecialchars($isAdmin ? 'Yönetici' : 'Kullanıcı'); ?>)
                <button id="logoutButton" class="btn btn-danger btn-sm"><i class="fas fa-sign-out-alt"></i> Çıkış Yap</button>
            <?php else: // Kullanıcı giriş yapmamışsa ?>
                <button id="openLoginModalBtn" class="btn btn-primary btn-sm"><i class="fas fa-sign-in-alt"></i> Yönetici Girişi</button>
            <?php endif; ?>
        </div>
    </header>
    <div class="app-container">
        <nav class="app-nav">
            <button id="tab-groups" class="active"><i class="fas fa-users"></i> Farm Grupları</button>
            <?php if ($isAdmin): // Sadece yöneticiler görebilir ?>
            <button id="tab-players"><i class="fas fa-user-friends"></i> Oyuncu Yönetimi</button>
            <button id="tab-report"><i class="fas fa-chart-pie"></i> Raporlar</button>
            <?php endif; ?>
            <button id="tab-global-receivables"><i class="fas fa-money-check-alt"></i> Genel Alacaklar</button>
        </nav>

        <main class="app-content">
            <section id="groups-section" class="active">
                <div class="section-header">
                    <h2>Farm Grupları</h2>
                </div>
                <div class="grid-layout">
                    <!-- Yönetici dışındaki kullanıcılardan gizlenecek bölümler -->
                    <div class="card create-group-card <?php echo $isAdmin ? '' : 'hidden-for-non-admin'; ?>">
                        <h3><i class="fas fa-plus-circle"></i> Yeni Farm Grubu</h3>
                        <div class="form-group">
                            <label for="newGroupName">Grup Adı</label>
                            <input id="newGroupName" type="text" placeholder="Grup adı girin...">
                        </div>
                        <div class="form-group">
                            <label for="newGroupPlayers">Oyuncular (virgülle ayırın)</label>
                            <input id="newGroupPlayers" type="text" placeholder="Ali, Veli, Zeynep">
                        </div>
                        <button class="btn btn-primary" onclick="createGroup()"><i class="fas fa-users-medical"></i> Grup Oluştur</button>
                    </div>
                    <!-- Normal kullanıcı rolündeyse liste tam genişlik kaplar -->
                    <div class="card group-list-card <?php echo $isAdmin ? '' : 'full-width-for-non-admin'; ?>">
                        <h3><i class="fas fa-layer-group"></i> Mevcut Gruplar</h3>
                        <div class="form-group">
                            <input id="searchGroup" type="text" placeholder="Grup ara..." onkeyup="renderGroupList()">
                        </div>
                        <div id="groupList" class="group-list"></div>
                    </div>
                </div>
                <hr class="section-divider">
                <div id="groupDetail" class="group-detail-section"></div>
            </section>

            <?php if ($isAdmin): // Sadece yöneticiler görebilir ?>
            <!-- Oyuncu Yönetimi bölümü sadece yöneticiye görünür -->
            <section id="players-section">
                <div class="section-header">
                    <h2><i class="fas fa-users-cog"></i> Tüm Oyuncular</h2>
                </div>
                <div class="grid-layout">
                    <div class="card add-player-card">
                        <h3><i class="fas fa-user-plus"></i> Yeni Oyuncu Ekle</h3>
                        <div class="form-group">
                            <label for="newPlayerName">Oyuncu Adı</label>
                            <input id="newPlayerName" type="text" placeholder="Oyuncu adı girin...">
                        </div>
                        <button class="btn btn-primary" onclick="addGlobalPlayer()"><i class="fas fa-user-plus"></i> Ekle</button>
                    </div>
                    <div class="card player-table-card">
                        <h3><i class="fas fa-list"></i> Oyuncu Listesi</h3>
                        <div class="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Oyuncu</th>
                                        <th>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody id="playersTable"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>

            <section id="report-section">
                <div class="section-header">
                    <h2><i class="fas fa-chart-line"></i> Genel Rapor</h2>
                </div>
                <div id="reportContent" class="report-cards"></div>
            </section>
            <?php endif; ?>

            <!-- Yeni "Genel Alacaklar" bölümü -->
            <section id="global-receivables-section">
                <div class="section-header">
                    <h2><i class="fas fa-money-bill-wave"></i> Genel Oyuncu Alacakları</h2>
                </div>
                <div class="card full-width-for-non-admin">
                    <h3><i class="fas fa-clipboard-list"></i> Tüm Oyuncuların Özet Alacakları</h3>
                    <div class="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Oyuncu</th>
                                    <th>Toplam Kazanç (Tüm Gruplar)</th>
                                    <th>Toplam Ödenen (Tüm Gruplar)</th>
                                    <th>Kalan Bakiye</th>
                                </tr>
                            </thead>
                            <tbody id="globalReceivablesTable">
                                <!-- Buraya JavaScript ile veriler yüklenecek -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

        </main>
    </div>

    <!-- Item Modal (Pop-up Penceresi) -->
    <div class="modal" id="itemModal">
        <div class="modal-content">
            <span class="close-button" onclick="closeItemModal()"><i class="fas fa-times"></i></span>
            <h2 id="itemModalTitle">Yeni Item</h2>
            <div class="form-group">
                <label for="modalItemName">Item Adı</label>
                <input id="modalItemName" type="text" placeholder="Item adı girin...">
            </div>
            <div class="form-group">
                <label for="modalSeller">Satıcı</label>
                <select id="modalSeller"></select>
            </div>
            <div class="form-group">
                <label for="modalPrice">Satış Fiyatı (Coins)</label>
                <input id="modalPrice" type="number" min="0" placeholder="0">
            </div>
            <div class="form-group">
                <label for="modalStatus">Durum</label>
                <select id="modalStatus">
                    <option value="pending">Beklemede</option>
                    <option value="sold">Satıldı</option>
                    <option value="reserved">Rezerve</option>
                </select>
            </div>
            <button class="btn btn-success" onclick="saveItem()"><i class="fas fa-save"></i> Kaydet</button>
        </div>
    </div>

    <!-- Admin Giriş Modalı -->
    <div class="modal" id="adminLoginModal">
        <div class="modal-content">
            <span class="close-button" onclick="closeAdminLoginModal()"><i class="fas fa-times"></i></span>
            <h2>Yönetici Girişi</h2>
            <form id="loginForm">
                <div class="form-group">
                    <label for="loginUsername">Kullanıcı Adı</label>
                    <input type="text" id="loginUsername" name="username" required>
                </div>
                <div class="form-group">
                    <label for="loginPassword">Şifre</label>
                    <input type="password" id="loginPassword" name="password" required>
                </div>
                <button type="submit" class="btn btn-primary">Giriş Yap</button>
            </form>
            <!--<p class="auth-info">Kullanıcı Adı: <strong>admin</strong>, Şifre: <strong>adminpass</strong></p>-->
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>
