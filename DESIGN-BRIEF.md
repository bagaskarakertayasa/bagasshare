# Design Brief: Bagas Share

Versi: 1.0 | Status: Draft | Tanggal: 2026-11-16
Acuan: [PRD.md](PRD.md) v1.3, [TECH-DESIGN.md](TECH-DESIGN.md) v0.1.
Belum ada kode. Aturan visual mengikuti panduan "app screen" dari skill design-taste-frontend (warna untuk data dan status, permukaan datar, tanpa gradien/glow/glass/emoji). Skrip `draw` dan `inspect` dari skill itu belum dijalankan karena belum ada halaman untuk diperiksa; keduanya dijalankan setelah build pertama.

Tanda **[KEPUTUSAN DESAIN]** = saya tetapkan karena Anda menyerahkan arah visual ke saya. **[OPEN]** = perlu jawaban Anda (bagian 11).

---

## 0. Ringkasan Produk untuk Desain

- Satu layar kerja, tanpa login, tanpa halaman pemasaran. Alamat web langsung membuka aplikasi.
- Pekerjaan utama: kirim file dari device ini ke device lain di jaringan yang sama.
- Batas yang harus terlihat di UI: 100 MB per file, 1 GB per permintaan, 10 file per hari per IP, maksimal 5 device per grup.
- Maksimal 4 device lain terlihat sekaligus (5 dikurangi device sendiri). Angka ini menentukan grid.
- Pengguna: individu. Dipakai sekilas, beberapa kali sehari, sering di HP.

**Pertanyaan yang dijawab layar utama:** "Ke device mana saya bisa kirim file sekarang?"
**Temuan yang selalu ditampilkan:** berapa device terdeteksi dan nama device ini sendiri.
**Pekerjaan paling sering:** pilih file lalu kirim. Harus selesai dalam dua aksi dari layar utama: ketuk device, pilih file.

---

## 1. Design Principles

### P1. Satu layar, satu pekerjaan
Tidak ada menu navigasi, tidak ada halaman kedua. Semua keadaan (kirim, terima, pairing, resume) muncul sebagai dialog, sheet, atau baris di layar yang sama. Setiap fitur yang tidak membantu mengirim file ditolak masuk layar utama.
*Alasan:* produk punya satu fungsi dan dibuka sebentar. Navigasi tambahan hanya menambah langkah. Ini juga mengurangi pekerjaan sebelum rilis 16 Desember.

### P2. Penerima selalu tahu dan selalu memutuskan
Tidak ada file masuk tanpa dialog persetujuan. Dialog menampilkan siapa pengirim (nama device), apa yang dikirim (nama file dan ukuran), dan berapa total. Fokus awal tidak jatuh ke tombol Terima, sehingga Enter tidak menerima secara tidak sengaja.
*Alasan:* PRD mengizinkan orang asing di wifi publik saling terlihat. Persetujuan adalah satu-satunya perlindungan, jadi tampilannya tidak boleh bisa terlewat atau salah tekan.

### P3. Status ditulis dengan kata dan angka nyata
Setiap status memakai teks ("Mengirim", "Terputus, menunggu koneksi") dan angka dari data sebenarnya (byte, persen, sisa kuota). Warna hanya memperkuat, tidak pernah menjadi satu-satunya pembeda. Setiap kegagalan menyebut penyebab dan langkah berikutnya. Batas (100 MB, 1 GB, kuota, grup penuh) ditampilkan di samping kontrol yang dibatasi, bukan baru muncul setelah ditolak.
*Alasan:* tanpa TURN, koneksi bisa gagal di beberapa jaringan, dan resume setelah refresh butuh pengirim memilih ulang file. Pengguna hanya mau percaya jika UI jujur tentang batas dan kegagalan itu.

---

## 2. Visual Direction

### Gagasan
**Device-device di ruangan menjadi petak besar yang bisa Anda tarik file ke atasnya.**

Tes pembanding: ShareDrop menaruh device sebagai lingkaran di sekitar satu titik. Kalimat gagasan ini tidak berlaku untuk ShareDrop, jadi arah ini tidak sama dengan miliknya. Barang-barang yang hanya dimiliki produk ini dan jadi bahan visual:
- Nama device otomatis ("Chrome di Android", "Safari di iPhone") sebagai judul petak.
- Siluet device (HP, tablet, laptop, desktop) digambar dengan kode, satu bahasa grafis datar.
- Kode pairing 6 digit sebagai angka besar, mirip nomor antrean.
- Satu warna pucat tetap untuk tiap device, sehingga "Chrome di Android" selalu berwarna sama di petak, di baris transfer, dan di dialog.

### Mood
Alat kerja yang tenang dan terang. Seperti papan informasi: teks besar, status jelas, hampir tanpa hiasan. Warna kuat hanya di data (progress) dan aksi utama. Terasa cepat dan tepercaya, bukan lucu.

### Referensi (perilaku, bukan tampilan untuk ditiru)
- ShareDrop: model deteksi device di jaringan yang sama, tanpa akun.
- Dialog terima AirDrop: pengirim dan isi file terlihat sebelum menerima.
- Papan keberangkatan: status dalam kata, angka rata kanan, mudah dipindai.

### Yang dihindari
| Hindari | Kenapa |
|---|---|
| Radar, riak, atau animasi "mencari" | Menipu soal status nyata (P3). Status hanya "terhubung ke server" atau tidak |
| Ikon awan dan panah unggah | Produk ini tidak memakai cloud; file tidak lewat server |
| Gradien, glow, glass, blur | Aturan skill; juga membebani HP lama |
| Ilustrasi orang, maskot, confetti | Tidak menambah informasi |
| Kartu fitur berikon, hero pemasaran | Tidak ada halaman pemasaran |
| Palet ungu/indigo dan krem + terakota | Warna default hasil generator |
| Emoji di UI | Tidak konsisten antar OS |
| Teks kecil huruf kapital berjarak | Sulit dibaca, dan melanggar aturan skill |
| Monospace untuk kode pairing | Dipakai font utama dengan angka tabular; satu keluarga huruf |
| Garis tipis di semua sisi kartu | Pemisah memakai selisih tone permukaan |

---

## 3. Design Tokens

### 3.1 Warna

**Fondasi**
| Token | Hex | Pemakaian |
|---|---|---|
| `--ground` | `#F2F4F0` | Latar halaman. Abu kehijauan pucat. Dipilih agar tidak jatuh ke `#F8F8F8` generik, dan tidak bentrok dengan warna device |
| `--surface` | `#FFFFFF` | Petak device, dialog, baris transfer |
| `--surface-sunken` | `#E6EAE2` | Trek progress, input berisi, area drop |
| `--line` | `#CBD2C8` | Pemisah baris dalam daftar (1 px) |
| `--line-strong` | `#7C877F` | Batas input dan kontrol. Rasio 3.7:1 terhadap putih, memenuhi 3:1 untuk komponen UI |
| `--ink` | `#121A16` | Teks utama dan tombol utama. Hitam kehijauan, lebih hangat dari hitam murni |
| `--ink-muted` | `#55615B` | Teks sekunder, 5.8:1 terhadap `--ground` |

**Data dan status**
| Token | Hex | Pemakaian |
|---|---|---|
| `--data` | `#1E4FE0` | Isi progress bar, satu-satunya warna "data" di layar. Biru kobalt |
| `--success` | `#1F7A3D` | Selesai, kode diterima. Selalu dengan teks |
| `--warning` | `#8A5A00` | Terputus, kuota hampir habis. Teks amber tua; latar `#F4E3B8` |
| `--danger` | `#B3261E` | Gagal, ditolak, error input. Selalu dengan teks |

**Identitas device (pucat, 4 slot, tetap per device)**
| Slot | Latar | Isi / siluet | Hue |
|---|---|---|---|
| 1 mawar | `#F6D9DD` | `#8A2336` | 350 |
| 2 amber | `#F4E3B8` | `#5E4200` | 45 |
| 3 hijau | `#D3EAD6` | `#1F5A2E` | 140 |
| 4 biru | `#DAE5FA` | `#1D3F93` | 225 |

Slot ditetapkan dari urutan bergabung dalam grup dan dipertahankan selama device online. Jarak hue minimal 55 derajat. Tint ini penanda identitas, bukan data: tidak dipakai untuk progress atau status.

**Dasar pemilihan:** warna kuat hanya di dua tempat, tombol utama (hitam `--ink`) dan progress (`--data`). Tombol utama hitam menghindari tabrakan dengan biru device dan hijau sukses. Rasio kontras dihitung manual dari rumus luminans WCAG; verifikasi ulang dengan alat saat build.

| Pasangan | Rasio (perkiraan) | Lolos |
|---|---|---|
| `--ink` di `--ground` | 16:1 | AA, AAA |
| `--ink-muted` di `--ground` | 5.8:1 | AA |
| `--ink-muted` di `--surface` | 6.4:1 | AA |
| Putih di `--ink` (tombol utama) | 17:1 | AA, AAA |
| `--danger` di `--ground` | 5.9:1 | AA |
| `--success` di `--ground` | 4.9:1 | AA |
| `--warning` di `--ground` | 5.4:1 | AA |
| `--data` di `--ground` | 5.8:1 | AA (teks), lolos 3:1 (grafik) |
| `--data` di `--surface-sunken` (progress) | 4.8:1 | Lolos 3:1 untuk grafik |
| `--line-strong` di `--surface` | 3.7:1 | Lolos 3:1 untuk komponen UI |

**Mode gelap:** tidak ada di v1 **[KEPUTUSAN DESAIN]**. Token dibuat sebagai CSS custom properties sehingga mode gelap bisa ditambahkan tanpa mengubah komponen. Alasan: tenggat 16 Desember.

### 3.2 Tipografi

**Font: Plus Jakarta Sans, satu keluarga** **[KEPUTUSAN DESAIN]**.
Alasan: dirancang di Indonesia oleh Tokotype, jadi cocok untuk produk berbahasa Indonesia dan bergeometri ramah tapi tegas di bobot 600 dan 800. Lisensi SIL OFL, kompatibel dengan proyek MIT. Dipasang sendiri (self-host, subset Latin, woff2), bukan dari CDN Google. Alasannya: produk tanpa kebijakan privasi (R1) sebaiknya tidak meminta file font ke pihak ketiga, dan satu request lebih sedikit mempercepat buka di wifi publik.
Belum diverifikasi: dukungan angka tabular (`tnum`) dan cakupan huruf Plus Jakarta Sans. Jika gagal, ganti seluruh UI ke DM Sans (keputusan pemilik, O-D4). Bobot dan skala di bawah tidak berubah.
Bobot dipakai: 400, 600, 800. Fallback: `system-ui, sans-serif`.

| Token | Ukuran / baris | Bobot | Pemakaian |
|---|---|---|---|
| `--text-code` | 48 / 52 (HP 40 / 44) | 800, tracking -0.02em, tabular | Hanya kode pairing |
| `--text-h1` | 28 / 34 (HP 24 / 30) | 800 | Judul layar |
| `--text-h2` | 20 / 28 | 600 | Judul dialog, judul seksi |
| `--text-body` | 16 / 24 | 400 | Teks utama, nama device, nama file |
| `--text-small` | 14 / 20 | 400 / 600 | Status, subbaris, tombol kecil |
| `--text-caption` | 12 / 16 | 400 | Ukuran file, catatan batas. Tidak ada teks di bawah 12 px |

Maksimal lima ukuran per layar. Rata kiri. Angka ukuran file dan persen memakai tabular dan rata kanan di baris transfer. Format angka mengikuti bahasa (`Intl`): "48,2 MB" di ID, "48.2 MB" di EN.

### 3.3 Spacing (basis 4 px)
`--space-1: 4` `--space-2: 8` `--space-3: 12` `--space-4: 16` `--space-5: 24` `--space-6: 32` `--space-7: 48` `--space-8: 64`
- Satu nilai gutter antar petak: 24 (desktop/tablet), 12 (HP).
- Padding halaman: 32 (desktop), 24 (tablet), 16 (HP).
- Padding dalam petak dan dialog: 24 (desktop), 16 (HP).
- Tinggi baris daftar: 56 (file), 72 (transfer).
- Target sentuh minimum 44 x 44.

### 3.4 Radius
Tiga nilai saja **[KEPUTUSAN DESAIN]**:
| Token | Nilai | Pemakaian |
|---|---|---|
| `--radius-sm` | 6 | Tombol, input, chip |
| `--radius-lg` | 16 | Petak device, dialog, sheet, panel transfer |
| `--radius-full` | 999 | Trek dan isi progress bar, penanda status |

### 3.5 Shadow dan bidang
- Elemen diam: **tanpa shadow**. Pemisahan dengan selisih tone (`--surface` di atas `--ground`).
- Hanya yang melayang: `--shadow-float: 0 8px 24px rgba(18, 26, 22, 0.16)` untuk dialog, sheet, dan toast.
- Overlay di belakang dialog: `rgba(18, 26, 22, 0.48)`, tanpa blur.
- Fokus: cincin 2 px `--ink` dengan offset 2 px `--ground`/`--surface` (kontras 3:1 atau lebih di semua latar).

### 3.6 Motion
| Token | Nilai |
|---|---|
| `--dur-fast` | 120 ms (tekan, hover) |
| `--dur-base` | 200 ms (dialog dan sheet muncul, baris baru) |
| Easing | `cubic-bezier(0.2, 0, 0, 1)` |
- Tidak ada animasi masuk untuk isi layar. Gerak hanya sebagai umpan balik: tekan, hover, fokus, dialog dibuka, baris transfer baru, lebar progress.
- Progress mengikuti data nyata, tanpa animasi palsu. Spinner hanya untuk menunggu yang nyata (menghubungkan ke server).
- `prefers-reduced-motion`: semua transisi menjadi 0 ms, konten tetap muncul.

### 3.7 Breakpoint
| Nama | Lebar | Padding | Kolom petak |
|---|---|---|---|
| HP | < 640 | 16 | 1 (baris penuh) |
| Tablet | 640 sampai 1023 | 24 | 2 |
| Desktop | 1024 ke atas | 32 | 4 |

---

## 4. Screen Inventory

Rute: hanya `/`. Semua di bawah ini adalah keadaan di dalam satu halaman, kecuali S10 dan S11.

| # | Screen | Tujuan | Jenis |
|---|---|---|---|
| S1 | Beranda (daftar device + panel transfer) | Menjawab "kirim ke mana", titik awal semua alur | Halaman |
| S2 | Composer kirim | Meninjau file sebelum dikirim, memvalidasi batas | Dialog (desktop), sheet (HP) |
| S3 | Permintaan masuk | Penerima memutuskan menerima atau menolak | Dialog / sheet, memblokir |
| S4 | Baris transfer | Menampilkan status dan progress per permintaan, tombol unduh satu per satu | Panel di S1 |
| S5 | Pairing | Membuat atau memasukkan kode 6 digit | Dialog / sheet |
| S6 | Resume | Melanjutkan transfer yang terputus setelah refresh | Banner + baris di S4 + file picker |
| S7 | Toast | Pesan singkat: grup penuh, error ringan | Kanan atas |
| S8 | Banner sistem | Offline, server terputus, kuota habis | Di bawah app bar |
| S9 | Pilih bahasa | Ganti ID/EN | Kontrol di app bar |
| S10 | Browser tidak didukung | Menghentikan aplikasi dengan penjelasan | Layar penuh |
| S11 | Halaman tidak ditemukan | Rute lain selain `/` | Layar penuh minimal |

Tidak ada halaman kebijakan privasi, syarat layanan, tentang, atau pengaturan di v1 (keputusan pemilik, PRD R1).

---

## 5. User Flow

### J1. Kirim file (alur utama)
1. Pengguna membuka web. Layar S1 tampil dengan nama device sendiri dan daftar device lain.
2. Desktop: menarik file ke petak device tujuan, atau mengklik petak. HP: mengetuk petak. Klik atau ketuk membuka pemilih file native (multi-pilih).
3. S2 terbuka dengan file terpilih. Setiap baris menunjukkan nama, ukuran, dan masalah (lebih dari 100 MB, ekstensi diblokir, 0 byte). Total dan sisa kuota ditampilkan.
4. Pengguna menekan "Kirim N file". Tombol nonaktif bila ada masalah atau total di atas 1 GB, dengan alasan tertulis di dekatnya.
5. S4 menambah baris: "Menunggu [nama device] menyetujui" dengan hitung mundur 60 detik dan tombol Batalkan.
6. Penerima menerima: baris berubah "Menghubungkan", lalu "Mengirim" dengan progress bar per file.
7. Semua file selesai: "Selesai", baris tetap sampai ditutup.

Cabang:
- Ditolak: "[Nama] menolak permintaan."
- 60 detik tanpa jawaban: "[Nama] tidak menjawab."
- Penerima sibuk: "[Nama] sedang menerima file lain."
- Koneksi langsung gagal dalam 15 detik: pesan FR9.4 dengan penyebab dan saran.
- Kuota kurang dari jumlah file: S2 menolak sebelum kirim.

### J2. Terima file
1. Device lain mengirim permintaan. S3 muncul di atas segalanya dan judul tab berubah menjadi "(1) Permintaan masuk".
2. Pengguna membaca pengirim, daftar file, total. Fokus ada di judul dialog.
3. Menekan "Terima": dialog tertutup, baris di S4 menunjukkan "Menerima" dan progress per file.
4. Setelah file lolos verifikasi checksum, tiap file punya tombol "Unduh". Pengguna mengunduh satu per satu (keputusan pemilik). Tombol berubah "Sudah diunduh" setelah ditekan.
5. Semua file diunduh: "Selesai".
Cabang: Tolak menutup dialog dan memberi tahu pengirim. Dialog berakhir sendiri pada 60 detik dengan teks "Permintaan berakhir".

### J3. Hubungkan dengan kode pairing
Pembuat: tombol "Kode pairing" di app bar, tab "Buat kode", kode 6 digit tampil besar dengan tombol Salin dan waktu berlaku.
Pemasuk: "Kode pairing", tab "Masukkan kode", mengisi 6 digit, menekan "Gabung".
Berhasil: device pembuat muncul di daftar S1 dengan keterangan "lewat kode". Kode tidak berlaku lagi (sekali pakai).
Gagal: salah, kedaluwarsa, sudah dipakai, terlalu banyak percobaan (diblokir sementara), grup penuh. Setiap kegagalan punya pesan sendiri.
Pairing bertahan saat refresh dan hilang saat tab ditutup.

### J4. Resume setelah refresh
1. Refresh saat transfer berjalan. Halaman memuat ulang dan banner "Ada transfer yang terputus" tampil.
2. Penerima: baris S4 berstatus "Terputus, menunggu pengirim" dengan persen terakhir. Data parsial tersimpan 24 jam.
3. Pengirim: banner dengan tombol "Pilih file yang sama" membuka pemilih file.
4. Sistem mencocokkan nama, ukuran, dan checksum. Cocok: transfer lanjut dari chunk terakhir. Tidak cocok: pesan "File ini berbeda dari yang sedang dikirim" dan pilihan mulai ulang dengan persetujuan baru.
5. Kedua device harus online. Bila salah satu tidak, baris tetap "Terputus".

### J5. Ganti bahasa
Tombol "ID | EN" di app bar. Pilihan langsung berlaku dan disimpan. Default ID.

### J6. Kuota habis
Pengirim mencoba membuka S2 saat kuota 0. Banner S8 ditampilkan "Kuota hari ini habis. Reset pukul 00:00 WITA." Petak device tetap tampil tetapi tidak bisa menerima file; alasan tertulis di setiap petak.

---

## 6. Layout per Screen

Bahasa teks di wireframe: ID. Semua teks tersedia juga dalam EN.

### S1. Beranda

**Bentuk shell:** tanpa sidebar. App bar 56 px di atas, kolom isi terpusat 1096 px (desktop). Hitungan grid: 4 x 256 + 3 x 24 = 1096. Padding halaman 32.

**Hierarki baca:** (1) judul dan jumlah device, (2) petak device, (3) panel transfer, (4) kuota.

```
App bar:  [mark] Bagas Share            Kuota: 7 file   [Kode pairing]  [ID | EN]

h1        Device di jaringan ini
sub       2 device terdeteksi. Anda terlihat sebagai Chrome di Windows.

[ Petak 1 ]  [ Petak 2 ]  [ (kosong, tidak ada petak kosong) ]
 siluet       siluet
 Chrome di    Safari di
 Android      iPhone
 jaringan     lewat kode
 sama
 Tarik file
 ke sini

Panel "Transfer"
 baris 1: Chrome di Android   laporan-q3.pdf, 2 file lain    62%   Mengirim    [Batalkan]
 baris 2: ...
```

- **Aksi utama:** klik atau ketuk petak device. Tidak ada tombol "Kirim" di layar utama; petaknya adalah tombol. Pada desktop, drop file ke petak.
- **Komponen:** AppBar, Wordmark, QuotaIndicator, Button, LangSwitch, DeviceTile, TransferPanel, TransferRow, Banner, Toast.
- **Petak** hanya menampilkan device nyata. Tidak ada petak kosong atau penanda "menunggu device". Bila hanya ada satu device, hanya satu petak.
- Judul dan subbaris adalah teks biasa. h1 berupa kata benda ("Device di jaringan ini"), bukan sapaan.
- **Panel Transfer** hanya muncul bila ada baris. Saat kosong, bagian ini tidak digambar (tidak ada bingkai kosong).
- **Kuota:** di app bar, teks "Kuota 7 file" (sisa file untuk hari ini). Tertulis lengkap di S2: "Sisa 7 dari 10 file hari ini, reset pukul 00:00 WITA".
- Alamat web (bagasshare.web.id) hanya tertulis di keadaan kosong. Saat ada device terhubung, satu catatan 12 px di bawah subbaris: "Biarkan tab ini terbuka agar permintaan masuk terlihat." (O-D2). Tidak ada petunjuk pemakaian lain.

### S2. Composer kirim
Desktop: dialog 560 px, `--radius-lg`, `--shadow-float`. HP: sheet dari bawah, tinggi maksimal 85% layar.

```
Kirim ke [siluet kecil] Chrome di Android                 [Tutup]

 laporan-q3.pdf                              48,2 MB   [Hapus]
 foto-rapat-1.jpg                            12,4 MB   [Hapus]
 setup.exe                                   30,0 MB   Diblokir: .exe tidak boleh dikirim   [Hapus]
 [ + Tambah file ]

 2 file dipilih, 60,6 MB dari maksimal 1 GB.
 Sisa kuota: 7 dari 10 file hari ini. Reset 00:00 WITA.

                                         [Batal]   [Kirim 2 file]
```
- **Aksi utama:** "Kirim N file", satu-satunya tombol hitam di dialog.
- Baris bermasalah memakai teks `--danger` dengan kalimat penyebab, bukan hanya ikon. Tombol Kirim tetap aktif bila masih ada file valid; file bermasalah tidak ikut terkirim, dan jumlahnya di tombol hanya menghitung file valid. **[KEPUTUSAN DESAIN]**
- Daftar bergulir di dalam dialog bila lebih dari 5 baris. Header dan footer tetap.
- Batas selalu tertulis di bawah daftar (1 GB, kuota), sebelum ada masalah.
- Komponen: Dialog/Sheet, FileRow, Button, TotalsBar.

### S3. Permintaan masuk
Dialog atau sheet memblokir, di atas segalanya. Overlay menutup layar. Tidak bisa ditutup dengan klik di luar.

```
[siluet, latar tint device]  Chrome di Windows ingin mengirim 3 file

 laporan-q3.pdf                       48,2 MB
 foto-rapat-1.jpg                     12,4 MB
 catatan.txt                           4 KB
 Total 60,6 MB                        Berakhir dalam 0:42

                                    [Tolak]   [Terima]
```
- **Aksi utama:** Terima (hitam). Tolak adalah tombol sekunder dengan ukuran sama dan jarak 12 px agar tidak mudah tertukar.
- Fokus awal ke judul dialog (`tabindex="-1"`), bukan ke Terima. Escape sama dengan Tolak.
- Hitung mundur 60 detik memakai angka tabular. Habis: dialog berubah menjadi "Permintaan berakhir" dengan satu tombol Tutup.
- Warna tint device pengirim memudahkan pengenalan di antara beberapa permintaan, bukan sebagai peringatan.
- Komponen: Dialog/Sheet, DeviceBadge, FileRow (versi baca saja), Button.

### S4. Panel Transfer dan baris transfer
Panel lebar penuh, `--surface`, `--radius-lg`. Baris 72 px, dipisah garis 1 px `--line`.

```
 [titik tint]  Chrome di Android            Mengirim 3 file                 [Batalkan]
               laporan-q3.pdf  ████████░░░  62%    29,9 dari 48,2 MB
               foto-rapat-1.jpg  menunggu
               catatan.txt       menunggu
```
- Susunan baris: device (dengan titik tint), status dalam kata, daftar file yang dapat diluaskan, progress per file.
- Progress bar 8 px, `--radius-full`, isi `--data`, trek `--surface-sunken`. Persen dan "29,9 dari 48,2 MB" di kanan, tabular.
- Untuk penerima: setelah selesai, tiap file punya tombol "Unduh".
- Baris selesai tetap sampai ditutup dengan tombol "Tutup" kecil, dan hilang saat halaman di-refresh (keputusan pemilik, O-D1).
- Komponen: TransferRow, ProgressBar, StatusText, Button.

### S5. Pairing
Dialog 440 px (desktop), sheet (HP). Dua mode lewat kontrol segmen selebar opsinya.

```
Kode pairing                                                [Tutup]
[ Buat kode | Masukkan kode ]

Buat kode:
   4 8 2 1 7 3                          (--text-code, tabular)
   [Salin]
   Berlaku 24 jam, sekali pakai. Habis 17 Des 2026, 09.50 WITA.

Masukkan kode:
   [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]
   [Gabung]
```
- Tampilan kode memakai `--text-code` agar bisa dibaca dari jarak satu lengan di layar lain. Tanpa bingkai; hanya angka di atas `--surface`.
- Sel input: 6 kotak 48 x 56, `inputmode="numeric"`, mendukung tempel seluruh 6 digit.
- Tombol Gabung aktif hanya bila 6 digit terisi. Tidak ada kirim otomatis, agar percobaan salah tidak menghabiskan batas 10 percobaan per jam.
- Komponen: Dialog/Sheet, Segmented, CodeDisplay, CodeInput, Button.

### S6. Resume
Banner di bawah app bar plus baris di S4.
```
Ada transfer yang terputus: laporan-q3.pdf (62%).   [Pilih file yang sama]
```
Penerima melihat "Terputus, menunggu pengirim" tanpa tombol aksi, hanya Batalkan. Pengirim melihat tombol "Pilih file yang sama". Komponen: Banner, TransferRow, Button.

### S7. Toast
Kanan atas, 16 px dari tepi, lebar maksimal 360 px, di atas app bar. Memakai untuk "Grup penuh" (keputusan pemilik) dan error ringan. Teks 14 px, tombol Tutup. Hilang sendiri setelah 6 detik, kecuali error yang membutuhkan tindakan. Hover atau fokus menghentikan hitungan.

### S8. Banner sistem
Satu banner pada satu waktu, di bawah app bar, lebar penuh. Prioritas: offline, server terputus, kuota habis, resume.

### S9. Pilih bahasa
Kontrol dua opsi "ID | EN" di app bar, selebar dua opsinya. Opsi aktif memakai latar `--ink` dan teks putih. Pilihan disimpan di browser.

### S10. Browser tidak didukung
Layar penuh, teks rata kiri, nama produk, satu kalimat penyebab ("Browser ini belum mendukung WebRTC"), daftar versi minimum (Chrome, Safari iOS, Firefox) dan tidak ada tombol aksi.

### S11. Halaman tidak ditemukan
Nama produk, satu kalimat, satu tautan "Kembali ke Bagas Share".

---

## 7. Component Library

Semua komponen mendukung ID dan EN, dan memakai token di bagian 3.

| Komponen | Variant | State |
|---|---|---|
| **AppBar** | Desktop (kontrol berlabel), HP (kontrol ringkas) | Default, dengan banner di bawah |
| **Wordmark + mark** | Penuh, hanya mark | Default |
| **Button** | Primary (`--ink` latar, putih teks), Secondary (`--surface-sunken`, teks `--ink`), Ghost (teks saja), Danger (teks dan batas `--danger`) | Default, hover (tone satu langkah), pressed, focus (cincin), disabled (teks `--ink-muted` di `--surface-sunken`, alasan tertulis di dekatnya), loading (spinner kecil + label tetap) |
| **IconButton** | Tutup, Salin, Hapus | Default, hover, focus, pressed; wajib `aria-label`; area sentuh 44 px |
| **DeviceTile** | Per slot warna (4); per jenis siluet (HP, tablet, laptop, desktop, tidak diketahui) | Default, hover, focus, drag-over (batas 2 px `--ink`, latar tint satu langkah lebih tua), busy ("Sedang menerima file"), disabled (kuota habis), baru muncul (fade 200 ms), pergi (hilang cepat) |
| **DeviceBadge** | Titik tint + nama; ukuran kecil (baris) dan sedang (dialog) | Default |
| **DeviceSilhouette** | HP, tablet, laptop, desktop, tidak diketahui; digambar SVG datar di warna isi slot | Statis |
| **QuotaIndicator** | Ringkas (app bar), lengkap (composer) | Normal, rendah (tersisa 3 atau kurang: teks `--warning`), habis (teks `--danger`) |
| **Segmented** | 2 opsi (Buat/Masukkan, ID/EN) | Aktif, tidak aktif, hover, focus, disabled |
| **FileRow** | Pilihan (dengan Hapus), baca saja (dialog masuk), transfer (dengan progress) | Valid, error (teks `--danger` dengan penyebab), diblokir, sedang dikirim, selesai, terunduh |
| **TotalsBar** | Dalam composer | Normal, melebihi 1 GB (`--danger`), kuota kurang (`--danger`) |
| **ProgressBar** | Menentukan saja | Berjalan, terputus (isi `--warning`), selesai (isi `--success`), gagal (isi `--danger`), menunggu (hanya trek) |
| **StatusText** | Dengan glyph kecil (bulat, centang, silang) | Menunggu, Menghubungkan, Mengirim, Menerima, Terputus, Selesai, Ditolak, Tidak dijawab, Gagal, Dibatalkan |
| **TransferRow** | Pengirim, penerima, terputus-menunggu | Semua state StatusText; dapat diluaskan untuk daftar file |
| **Dialog** | Standar, memblokir (S3) | Terbuka, tertutup; fokus terkunci di dalam; Escape menutup kecuali yang memblokir (Escape = Tolak) |
| **Sheet** | Bawah, 85% tinggi | Sama dengan Dialog; handle dihilangkan karena tidak bisa digeser (hindari gestur tersembunyi) |
| **CodeDisplay** | 6 digit besar | Aktif, kedaluwarsa (teks `--ink-muted` dengan "Kedaluwarsa"), terpakai |
| **CodeInput** | 6 sel | Kosong, terisi, fokus, error (batas `--danger` + pesan), disabled (diblokir sementara dengan hitung mundur) |
| **Toast** | Info, error | Muncul, hover (jeda), tutup; `role="status"` atau `role="alert"` |
| **Banner** | Offline, server terputus, kuota habis, resume | Terlihat, bisa ditutup (hanya resume) |
| **EmptyState** | Beranda sendirian, beranda kuota habis | Default |
| **Spinner** | 16 px | Hanya untuk "Menghubungkan ke server" dan tombol loading |
| **Skeleton** | Petak device | Datar `--surface-sunken`, tanpa kilau |

---

## 8. State

Teks contoh dalam ID (EN disediakan sejajar di kamus yang sama).

### S1. Beranda
| State | Tampilan |
|---|---|
| Loading (menghubungkan ke server) | Satu petak skeleton datar + teks "Menghubungkan ke server" dengan spinner 16 px. Judul tetap tampil |
| Empty (tidak ada device lain) | h1 "Device di jaringan ini", sub "Belum ada device lain." Satu blok: "Buka bagasshare.web.id di device lain yang memakai wifi yang sama, atau hubungkan dengan kode." + tombol "Gunakan kode pairing". Bingkai tidak hilang |
| Berisi | Petak per device. Jumlah di sub ditulis angka sebenarnya, nol ditulis "0 device" bila perlu |
| Error server | Banner `--danger`: "Tidak bisa terhubung ke server. Mencoba lagi dalam 5 detik." + tombol "Coba sekarang". Petak yang ada dikunci |
| Offline browser | Banner: "Tidak ada koneksi internet. Transfer yang sedang berjalan di jaringan lokal bisa tetap lanjut." (hanya bila ada transfer berjalan) |
| Grup penuh | Toast kanan atas "Grup penuh. Maksimal 5 device." Petak tidak tampil; layar S1 menampilkan keadaan sendirian dengan penjelasan |
| Kuota habis | Banner kuota habis; petak ditandai "Kuota habis" dan tidak bisa menerima file |
| Sukses | Tidak ada keadaan sukses khusus di S1; sukses ada di baris transfer |

### S2. Composer
| State | Tampilan |
|---|---|
| Empty (belum ada file) | Tidak terjadi: composer hanya terbuka setelah file dipilih. Bila semua file dihapus, composer menutup |
| Berisi, valid | Tombol "Kirim N file" aktif |
| Sebagian error | Baris error dengan penyebab; tombol hanya menghitung file valid |
| Semua error | Tombol nonaktif; di bawah daftar: "Tidak ada file yang bisa dikirim." |
| Total melebihi 1 GB | Totals menjadi `--danger`: "Total 1,2 GB melebihi batas 1 GB. Hapus beberapa file." Tombol nonaktif |
| Kuota kurang | "Sisa kuota 3 file, Anda memilih 5. Hapus 2 file." Tombol nonaktif |
| Loading | Tidak ada; pemilihan file lokal berlangsung seketika |

### S3. Permintaan masuk
| State | Tampilan |
|---|---|
| Normal | Seperti wireframe |
| Berakhir | "Permintaan berakhir. Pengirim perlu mengirim ulang." + Tutup |
| Pengirim membatalkan | "Chrome di Windows membatalkan permintaan." + Tutup |
| Menerima (setelah Terima) | Dialog tertutup; status pindah ke S4 |

### S4. Transfer
| State | Tampilan |
|---|---|
| Menunggu persetujuan | "Menunggu [nama] menyetujui (0:48)" + Batalkan |
| Menghubungkan | "Menghubungkan ke [nama]" (batas 15 detik) |
| Mengirim / Menerima | Progress per file, persen, byte |
| Terputus | Isi progress `--warning`, "Terputus, menunggu koneksi", lanjut otomatis |
| Selesai | Isi `--success`, "Selesai" + tombol Tutup |
| Ditolak | "[Nama] menolak permintaan." |
| Tidak dijawab | "[Nama] tidak menjawab dalam 60 detik." |
| Penerima sibuk | "[Nama] sedang menerima file lain. Coba lagi sebentar." |
| Gagal: koneksi langsung | "Koneksi langsung gagal. Pastikan kedua device di jaringan yang sama dan tidak memakai VPN." |
| Gagal: checksum | "File rusak saat dikirim. Kirim ulang." |
| Gagal: penyimpanan penuh | "Penyimpanan browser tidak cukup. Hapus ruang lalu coba lagi." |
| Dibatalkan | "Dibatalkan oleh [Anda atau nama]." |

### S5. Pairing
| State | Tampilan |
|---|---|
| Loading (membuat kode) | Tombol loading |
| Berisi (kode aktif) | Kode besar + masa berlaku |
| Kode salah | "Kode salah. Periksa 6 digit." |
| Kedaluwarsa | "Kode sudah kedaluwarsa. Minta kode baru." |
| Sudah dipakai | "Kode ini sudah dipakai. Minta kode baru." |
| Terlalu banyak percobaan | "Terlalu banyak percobaan. Coba lagi dalam 42 menit." Input dikunci |
| Grup penuh | "Grup sudah berisi 5 device." |
| Sukses | Dialog menutup, petak baru muncul di S1 dengan keterangan "lewat kode" |

### S6. Resume
| State | Tampilan |
|---|---|
| Pengirim, belum memilih ulang | Banner dengan tombol "Pilih file yang sama" |
| File cocok | Baris kembali "Mengirim" dari persen terakhir |
| File berbeda | "File ini berbeda dari yang sedang dikirim." + "Mulai ulang" (butuh persetujuan baru) |
| Penerima menunggu | "Terputus, menunggu pengirim" |
| Data kedaluwarsa (lebih dari 24 jam) | "Transfer sebelumnya sudah dihapus setelah 24 jam. Minta pengirim mengirim ulang." |
| Penyimpanan browser tidak tersedia (mode privat) | "Resume tidak tersedia di mode privat. Transfer akan dimulai dari awal." |

### S10 dan S11
Statis, tanpa state tambahan.

---

## 9. Responsive Behaviour

| Aspek | HP (< 640) | Tablet (640 sampai 1023) | Desktop (1024 ke atas) |
|---|---|---|---|
| App bar | 56 px: mark, "Kode pairing" (ikon + label), ID/EN. Kuota pindah ke bawah judul | 56 px: semua kontrol berlabel | 56 px: semua kontrol berlabel, kuota di kanan |
| Daftar device | Satu kolom, petak jadi baris 72 px: siluet 40 px di kiri, nama dan keterangan di kanan | 2 kolom (2 x 348 + 24 = 720) | 4 kolom (4 x 256 + 3 x 24 = 1096) |
| Cara kirim | Ketuk baris, pemilih file native | Ketuk atau tarik file | Klik atau tarik file ke petak |
| Composer | Sheet bawah, 85% tinggi, tombol penuh lebar di dasar | Dialog 560 px | Dialog 560 px |
| Permintaan masuk | Sheet penuh lebar, tombol bertumpuk: Terima di atas, Tolak di bawah, tinggi 48 | Dialog 480 px | Dialog 480 px |
| Pairing | Sheet | Dialog 440 px | Dialog 440 px |
| Panel transfer | Baris bertumpuk: info di atas, progress di bawah, tombol di kanan baris pertama | Satu baris | Satu baris |
| Toast | Atas, lebar penuh dikurangi 16 px per sisi, di bawah app bar | Kanan atas, 360 px | Kanan atas, 360 px |
| Drag and drop | Dihilangkan | Aktif bila perangkat mendukung | Aktif |
| Padding halaman | 16 | 24 | 32 |

Aturan umum:
- Tidak ada scroll horizontal di lebar 320 px.
- Konten dikunci terpusat di 1096 px untuk layar lebih lebar dari 1160 px.
- Elemen sentuh minimum 44 px di HP dan tablet.
- Tanpa hover untuk fungsi penting: semua yang muncul saat hover harus juga bisa diakses lewat ketuk dan fokus keyboard.
- Safari iOS: tinggi sheet memakai `dvh` agar tidak terpotong bilah alamat. Kolom input memakai ukuran huruf 16 px agar Safari tidak memperbesar halaman saat fokus.
- Layar mati atau tab di background di iOS: UI menampilkan peringatan "Biarkan layar tetap menyala selama transfer" pada baris transfer yang berjalan (PRD E23).

---

## 10. Accessibility

Target: WCAG 2.2 AA.

### Kontras
Lihat tabel di bagian 3.1. Semua teks minimal 4.5:1. Komponen UI dan grafik minimal 3:1. Status tidak pernah hanya berwarna: selalu ada kata dan glyph.

### Urutan fokus
1. Tautan lewati ke konten ("Lompat ke daftar device"), muncul saat fokus.
2. App bar: wordmark (bukan tautan), Kode pairing, ID/EN.
3. Banner sistem (bila ada) dan tombolnya.
4. h1 (tidak fokus), lalu petak device sesuai urutan DOM (urutan bergabung).
5. Panel transfer: tiap baris, lalu tombol di dalamnya.
6. Dialog yang terbuka: fokus berpindah ke dalam dan terkunci. Setelah ditutup, fokus kembali ke pemicu (petak atau tombol).
7. Dialog S3 (permintaan masuk) memindahkan fokus ke judulnya dan mengembalikan fokus ke elemen sebelumnya setelah ditutup.

### Navigasi keyboard
| Elemen | Tombol |
|---|---|
| Petak device | Tab untuk fokus; Enter atau Spasi membuka pemilih file (alternatif untuk drag and drop) |
| Composer | Tab antar baris dan tombol; Escape = Batal |
| Permintaan masuk | Tab antara Tolak dan Terima; Escape = Tolak |
| Kontrol segmen | Panah kiri dan kanan berpindah opsi; Tab keluar |
| Sel kode | Mengetik memindahkan fokus ke sel berikutnya; Backspace kembali; tempel mengisi 6 sel |
| Toast | Dapat difokus; Escape menutup |

Semua fungsi tersedia tanpa mouse dan tanpa gestur geser.

### ARIA dan semantik
- `<html lang>` mengikuti bahasa aktif dan berubah saat ganti bahasa.
- Satu `h1` per layar.
- Daftar device: `role="list"`; tiap petak adalah `<button>` dengan nama aksesibel "Kirim file ke Chrome di Android". Perubahan daftar (device masuk atau keluar) diumumkan lewat region `aria-live="polite"`: "Safari di iPhone bergabung."
- Ikon tanpa teks wajib `aria-label` (Tutup, Salin, Hapus).
- Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` ke judul, `aria-describedby` ke ringkasan. S3 memakai `role="alertdialog"` agar pembaca layar mengumumkan segera.
- Progress: `role="progressbar"` dengan `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, dan `aria-label` nama file. Pembaruan diumumkan di 25%, 50%, 75%, dan selesai lewat `aria-live="polite"`, bukan tiap persen.
- Status baris transfer: teks di dalam elemen `aria-live="polite"`.
- Toast error: `role="alert"`; info: `role="status"`.
- Pesan error input terhubung dengan `aria-describedby`; sel kode bertanda `aria-invalid` saat salah.
- Batas file ditulis dekat kontrol dan terhubung `aria-describedby`: "Maksimal 100 MB per file, total 1 GB."
- Hitung mundur 60 detik tidak diumumkan tiap detik; hanya status awal dan akhir.

### Preferensi pengguna
- `prefers-reduced-motion`: semua transisi 0 ms.
- Zoom 200% dan lebar 320 px (reflow) tanpa kehilangan fungsi.
- Teks tidak dipotong saat pengguna membesarkan ukuran huruf sistem.
- Ukuran sentuh minimum 44 x 44 px.

### Pengujian aksesibilitas sebelum rilis
- Pembaca layar: VoiceOver (iPhone), TalkBack (Android), NVDA (Windows), pada alur J1 sampai J4.
- Tab keyboard saja untuk J1, J2, dan J3.
- Pemeriksaan kontras otomatis dan manual pada token.

---

## 11. Keputusan Final dan Open Questions

Tidak ada pertanyaan desain yang memblokir build.

| # | Keputusan pemilik |
|---|---|
| O-D1 | Baris transfer yang selesai dipertahankan sampai ditutup pengguna atau halaman di-refresh. Bukan riwayat permanen. |
| O-D2 | Penerima dengan tab di background atau layar mati bisa melewatkan permintaan masuk. Keterbatasan ini diterima. UI memasang catatan kecil di S1 saat ada device terhubung: "Biarkan tab ini terbuka agar permintaan masuk terlihat." |
| O-D3 | Mode gelap ditunda sampai setelah rilis. |
| O-D4 | Font utama Plus Jakarta Sans. Bila angka tabular atau cakupan huruf gagal diverifikasi, ganti ke DM Sans tanpa konfirmasi ulang. |
| O-D5 | Logo: dua persegi panjang bertumpuk (HP dan laptop) warna `--data`, SVG. |
| O-D6 | Alamat web: bagasshare.web.id. Ditulis di keadaan kosong S1. |

---

## 12. Cara Memeriksa Hasilnya Setelah Build

1. Jalankan `inspect.mjs --app` dari skill design-taste-frontend pada build produksi di 1440, 768, dan 390 px. Perbaiki setiap FAIL.
2. Ambil tangkapan layar untuk setiap state di bagian 8 dan periksa sendiri.
3. Pastikan: satu `h1` per layar, tidak ada gradien, tidak ada shadow pada elemen diam, tidak ada teks di bawah 12 px, tiga radius saja, dan font benar-benar termuat (bukan fallback).
4. Uji di iPhone dan Android nyata (risiko R8 di PRD).

