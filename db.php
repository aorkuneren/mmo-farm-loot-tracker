<?php
// db.php

// Veritabanı dosyasının yolu
// __DIR__ bulunduğumuz dosyanın dizinini verir, böylece dosya yolu kesin olur.
define('DB_FILE', __DIR__ . '/database.sqlite');

try {
    // PDO (PHP Data Objects) kullanarak SQLite veritabanına bağlan
    // Eğer database.sqlite dosyası yoksa, bu satır otomatik olarak oluşturur.
    $pdo = new PDO('sqlite:' . DB_FILE);
    
    // PDO'nun hata modunu istisna olarak ayarla. Bu, veritabanı hatalarında PHP'nin PDOException fırlatmasını sağlar.
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Varsayılan fetch modunu ayarla. FETCH_ASSOC, sonuçları ilişkisel bir dizi olarak almanızı sağlar (sütun adları anahtar olarak kullanılır).
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // SQL sorguları ile tabloları oluştur.
    // 'IF NOT EXISTS' ifadesi, tablolar zaten varsa tekrar oluşturmaya çalışmasını engeller.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL, -- Dikkat: Gerçek uygulamada şifreler asla düz metin olarak saklanmamalı, password_hash() kullanılmalı!
            role TEXT NOT NULL DEFAULT 'user' -- 'admin' veya 'user' gibi roller için
        );

        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Grubun oluşturulduğu tarih ve saat
        );

        CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER,
            player_id INTEGER,
            PRIMARY KEY (group_id, player_id), -- Bir grupta aynı oyuncu tekrar olamaz
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE, -- Grup silinince üyelikler de silinir
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE -- Oyuncu silinince üyelikleri de silinir
        );

        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price REAL, -- Fiyat değeri (ondalıklı sayılar için REAL)
            seller_id INTEGER, -- Item'ı satan oyuncunun ID'si
            status TEXT NOT NULL DEFAULT 'pending', -- Item durumu: 'pending', 'sold', 'reserved'
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Item'ın oluşturulduğu tarih
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE, -- Grup silinince itemlar da silinir
            FOREIGN KEY (seller_id) REFERENCES players(id) ON DELETE SET NULL -- Satan oyuncu silinirse null olur
        );

        CREATE TABLE IF NOT EXISTS player_paid_amounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            amount_paid REAL NOT NULL DEFAULT 0.0, -- Oyuncuya ödenen miktar
            UNIQUE (group_id, player_id), -- Bir grup içinde bir oyuncu için tek bir ödenen miktar kaydı
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        );
    ");

    // Varsayılan yönetici kullanıcısını ekle.
    // Sadece 'admin' kullanıcı adı veritabanında yoksa ekle.
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?");
    $stmt->execute(['admin']);
    if ($stmt->fetchColumn() == 0) {
        $adminPasswordHash = password_hash('adminpass', PASSWORD_DEFAULT);
$pdo->prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')")
    ->execute([$adminPasswordHash]);
    }

} catch (PDOException $e) {
    // Veritabanı bağlantısı veya kurulumunda bir hata olursa, programı sonlandır ve hatayı göster.
    die("Veritabanı bağlantı veya kurulum hatası: " . $e->getMessage());
}
?>
