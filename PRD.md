# PRD — Bagas Share

Versi: 1.3 | Status: Draft | Tanggal: 2026-11-16 | Target rilis: 16 Desember 2026
Tipe: Web app, open source (MIT), publik, tanpa login, tanpa analytics.

Tanda **[OPEN]** = belum diputuskan. Tanda **[KEPUTUSAN PM]** = angka/aturan yang saya tetapkan karena Anda menyerahkannya ke saya; bisa diubah.

**Perubahan dari v1.1:** arsitektur dikunci ke **P2P WebRTC (ala ShareDrop)**. Server hanya signaling. Relay disk, TTL 24 jam, dan fallback server **dihapus**. Resume, batas harian, pairing, dan blokir ekstensi disesuaikan dengan arsitektur P2P. Target rilis: bulan depan.

---

## 1. Problem Statement

**Siapa dirugikan:** individu yang perlu memindahkan file antar device sendiri (PC ↔ Android ↔ iPhone) di jaringan yang sama.

**Kenapa:**
- Chat/email: butuh login, ukuran dibatasi, file tersimpan di akun pihak ketiga.
- Kabel USB: butuh kabel dan driver, tidak praktis ke iPhone.
- AirDrop/Nearby Share: terkunci per ekosistem.
- Aplikasi pihak ketiga: wajib instal di semua device.

## 2. Target User dan Persona

**Target:** individu, 2–5 device dalam satu jaringan. Bukan tim atau enterprise.

**Persona A — Raka, 24, freelancer.** PC Windows + Android. Memindahkan PDF, foto, dokumen kerja dari PC ke HP tanpa login dan tanpa instal.

**Persona B — Dina, 29, karyawan.** Laptop kantor + iPhone. Laptop tidak boleh instal aplikasi; AirDrop tidak jalan ke Windows.

## 3. Goals dan Non-Goals

### Goals
1. Transfer file ≤ 100 MB per file, total ≤ 1 GB per permintaan, lewat browser tanpa instalasi dan tanpa login.
2. Deteksi device otomatis di jaringan yang sama (gaya ShareDrop).
3. Penerima wajib menyetujui sebelum file dikirim.
4. Data file langsung antar device (P2P WebRTC, terenkripsi DTLS); file tidak melewati atau tersimpan di server.
5. Kode pairing sebagai cadangan jika deteksi otomatis gagal.
6. Resume transfer setelah koneksi putus atau browser di-refresh.
7. Blokir ekstensi berbahaya; batas 10 file/hari per IP.
8. UI Indonesia (default) dan Inggris; lisensi MIT.
9. Berjalan di Chrome, Safari iOS, Firefox terbaru.

### Non-Goals (v1)
- Akun/login.
- File > 100 MB per file.
- Relay server atau penyimpanan file di server.
- Fallback TURN (keputusan pemilik; risiko R10).
- Pemindaian malware di server.
- Riwayat permanen, kirim teks/link, broadcast ke banyak device.
- Halaman kebijakan privasi/ToS dan analytics (keputusan pemilik; risiko di bagian 10).
- PWA/aplikasi native.

## 4. User Stories

1. Sebagai pengguna, saya ingin membuka web tanpa login supaya langsung bisa dipakai.
2. Sebagai pengguna, saya ingin melihat device lain di jaringan yang sama supaya tahu ke mana bisa mengirim.
3. Sebagai pengguna, saya ingin memasukkan kode pairing 6 digit supaya tetap bisa terhubung saat deteksi otomatis gagal.
4. Sebagai pengirim, saya ingin memilih satu device tujuan supaya file masuk ke device yang benar.
5. Sebagai pengirim, saya ingin memilih file lewat tombol atau drag and drop supaya pengiriman cepat di PC.
6. Sebagai pengirim, saya ingin mengirim banyak file sekaligus supaya tidak mengulang proses.
7. Sebagai penerima, saya ingin menyetujui atau menolak permintaan masuk supaya tidak menerima file yang tidak saya inginkan, termasuk dari orang asing di wifi publik.
8. Sebagai pengirim dan penerima, saya ingin melihat progress bar supaya tahu status transfer.
9. Sebagai pengguna, saya ingin transfer dilanjutkan setelah koneksi putus atau browser di-refresh supaya tidak mengulang dari awal.
10. Sebagai penerima, saya ingin mengunduh file satu per satu supaya setiap file tersimpan utuh.
11. Sebagai pengguna, saya ingin file saya tidak melewati server supaya privasi terjaga.
12. Sebagai pengguna, saya ingin mengganti bahasa Indonesia/Inggris supaya nyaman dipakai.

## 5. Daftar Fitur

### MVP
| # | Fitur |
|---|-------|
| F1 | Deteksi device otomatis (signaling server) |
| F2 | Nama device otomatis |
| F3 | Kode pairing 6 digit |
| F4 | Pilih device tujuan |
| F5 | Pilih file + drag and drop + blokir ekstensi berbahaya |
| F6 | Banyak file (total ≤ 1 GB) |
| F7 | Persetujuan penerima |
| F8 | Progress bar |
| F9 | Transfer P2P WebRTC (terenkripsi) |
| F10 | Resume (termasuk setelah refresh) |
| F11 | Unduh satu per satu |
| F12 | Rate limit + batas 10 file/hari per IP |
| F13 | UI ID (default) + EN, tombol ganti bahasa |

### v2 (belum dikomit)
Kirim teks/link, riwayat sesi, ganti nama device manual, broadcast, halaman kebijakan privasi/ToS.

### Nanti
PWA, file > 100 MB.

## 6. Functional Requirements (MVP)

### F1 — Deteksi otomatis
- FR1.1 Saat halaman dibuka, client terhubung ke signaling server lewat WebSocket dan terdaftar online.
- FR1.2 Server mengelompokkan device berdasarkan IP publik yang sama. Device dari wifi publik/kampus yang berbagi IP akan saling terlihat (diterima oleh pemilik; mitigasi: persetujuan penerima).
- FR1.3 Daftar device dalam grup diperbarui realtime.
- FR1.4 Heartbeat tiap 5 detik; device dianggap offline setelah 15 detik tanpa heartbeat **[KEPUTUSAN PM]**.
- FR1.5 Maksimal 5 device per grup. Device ke-6 melihat pop-up kecil kanan atas: "Grup penuh".
- FR1.6 `device_id` disimpan di browser (localStorage) supaya tetap sama setelah refresh (dibutuhkan untuk resume).
- FR1.7 Tanpa login, tanpa input data pribadi.

### F2 — Nama device
- FR2.1 Format `{Browser} di {OS}` dari User-Agent.
- FR2.2 Nama kembar diberi nomor: "Chrome di Windows (2)".
- FR2.3 Device sendiri ditandai "Anda", tidak jadi target.

### F3 — Kode pairing
- FR3.1 Pengguna dapat membuat kode 6 digit angka; kode dibuat server.
- FR3.2 Kode berlaku 24 jam, sekali pakai: setelah satu device berhasil bergabung, kode tidak berlaku lagi.
- FR3.3 Device yang bergabung lewat kode masuk ke grup pembuat kode dan tunduk pada batas 5 device.
- FR3.4 Anti brute force: maksimal 10 percobaan salah per IP per jam, lalu diblokir sementara **[KEPUTUSAN PM]** (6 digit hanya 1.000.000 kemungkinan).
- FR3.5 Pairing bertahan setelah refresh halaman, dan **terputus otomatis saat tab/browser ditutup**. Implementasi: status pairing disimpan per tab (sessionStorage), bukan localStorage; server menghapus keanggotaan grup pairing saat device offline lebih dari 15 detik (FR1.4), sehingga refresh singkat tidak memutus pairing.
- FR3.6 Akibat FR3.5: jika tab ditutup lalu dibuka lagi, pairing hilang dan perlu kode baru (kode lama sudah terpakai). Resume (F10) tetap bisa berjalan jika kedua device kembali terhubung lewat deteksi otomatis atau pairing baru.

### F4 — Pilih device tujuan
- FR4.1 Tepat satu tujuan per permintaan.
- FR4.2 Tombol kirim nonaktif tanpa tujuan atau tanpa file.

### F5 — Pilih file, drag and drop, blokir ekstensi
- FR5.1 File picker native, multi-select; drag and drop di desktop saja.
- FR5.2 File > 100 MB ditolak per file dengan pesan jelas.
- FR5.3 Ekstensi diblokir (dicek case-insensitive, termasuk ekstensi ganda seperti `file.pdf.exe`): `.exe .msi .bat .cmd .com .scr .pif .vbs .vbe .wsf .ps1 .lnk .reg .hta .cpl .jar .dll .apk` (`.apk` ditambahkan atas keputusan pemilik; akibatnya aplikasi Android tidak bisa dikirim lewat Bagas Share). Ekstensi `.js .sh .py` tidak diblokir **[KEPUTUSAN PM]**.
- FR5.4 Blokir dicek di client pengirim, di server saat permintaan (nama file lewat signaling), dan di client penerima. Karena ini tanpa pemindaian isi, hanya melindungi dari ekstensi, bukan dari file yang disamarkan.
- FR5.5 File 0 byte ditolak **[KEPUTUSAN PM]**.

### F6 — Banyak file
- FR6.1 Satu permintaan: banyak file, tiap file ≤ 100 MB, total ≤ 1 GB.
- FR6.2 Satu persetujuan penerima untuk semua file dalam permintaan.
- FR6.3 Permintaan ditolak di awal jika jumlah file melebihi sisa kuota harian pengirim (F12).
- FR6.4 Status dan progress per file.

### F7 — Persetujuan penerima
- FR7.1 Dialog di penerima: nama pengirim, daftar file (nama + ukuran), Terima/Tolak.
- FR7.2 Tidak ada data file dikirim sebelum Terima; koneksi data channel baru dibuka setelah Terima.
- FR7.3 Tolak: pengirim melihat "Ditolak".
- FR7.4 Tanpa respons 60 detik: kedaluwarsa **[KEPUTUSAN PM]**.
- FR7.5 Penerima hanya menangani satu permintaan aktif; pengirim lain melihat "Penerima sedang sibuk" **[KEPUTUSAN PM]**.

### F8 — Progress bar
- FR8.1 Persen + ukuran terkirim/total per file, di kedua sisi.
- FR8.2 Status: menunggu, berjalan, terputus, selesai, ditolak, gagal, dibatalkan.
- FR8.3 Pengirim dan penerima dapat membatalkan.

### F9 — Transfer P2P WebRTC
- FR9.1 Data file dikirim langsung antar device lewat WebRTC data channel (terenkripsi DTLS). Server hanya meneruskan pesan signaling (SDP/ICE, metadata permintaan) dan tidak menerima isi file.
- FR9.2 STUN publik untuk NAT traversal. **Tanpa TURN** (keputusan pemilik); risiko R10.
- FR9.3 File dipecah menjadi chunk; setiap chunk punya nomor dan checksum.
- FR9.4 Jika koneksi P2P gagal terbentuk dalam 15 detik, tampilkan pesan: "Koneksi langsung gagal. Pastikan kedua device di jaringan yang sama dan tidak memakai VPN."
- FR9.5 HTTPS wajib (domain dan sertifikat sudah ada).

### F10 — Resume
- FR10.1 Penerima menyimpan chunk yang sudah diterima di storage browser (IndexedDB/OPFS), sehingga bertahan setelah refresh.
- FR10.2 Setelah koneksi putus: resume otomatis dari chunk terakhir yang valid begitu kedua device tersambung lagi.
- FR10.3 **Setelah refresh:** resume membutuhkan **kedua device online** dan **pengirim memilih ulang file yang sama**. Alasannya, browser tidak mengizinkan halaman mengakses ulang file lokal setelah refresh tanpa pengguna memilihnya lagi. Kecocokan file diverifikasi dari nama + ukuran + checksum.
- FR10.4 Data parsial di penerima disimpan 24 jam, lalu dihapus **[KEPUTUSAN PM]**.
- FR10.5 Jika pengirim memilih file berbeda, resume ditolak dan transfer dimulai dari awal atas persetujuan baru.

### F11 — Unduh
- FR11.1 Penerima mengunduh file satu per satu, tanpa ZIP.
- FR11.2 Nama dan ekstensi asli dipertahankan; nama disanitasi.
- FR11.3 Checksum seluruh file diverifikasi sebelum diizinkan unduh.

### F12 — Rate limit dan kuota harian
- FR12.1 Batas **10 file/hari per IP**, reset 00:00. File dihitung saat **berhasil diterima** (selesai dan checksum valid).
- FR12.2 Penghitungan oleh server: server menerbitkan `transfer_id` saat permintaan disetujui; penerima melaporkan selesai; server menambah hitungan sesuai jumlah file.
- FR12.3 Saat kuota habis, server menolak permintaan baru dari IP tersebut dan UI menampilkan pesan serta menonaktifkan kirim.
- FR12.4 Reset kuota pukul 00:00 Waktu Indonesia Tengah (WITA, UTC+8), mengikuti jam server yang dikonfigurasi ke zona tersebut.
- FR12.5 Rate limit signaling: maksimal 30 koneksi baru per menit per IP **[KEPUTUSAN PM]**.
- FR12.6 Karena data tidak lewat server, kuota ini hanya penegakan terbaik-usaha; klien yang dimodifikasi bisa menghindarinya (lihat risiko R2).

### F13 — Bahasa
- FR13.1 Bahasa default: Indonesia.
- FR13.2 Tombol ganti bahasa ID/EN di header; pilihan disimpan di browser.

### Non-functional
- NFR1 Browser: Chrome, Safari iOS, Firefox, versi terbaru dan satu sebelumnya.
- NFR2 UI responsif.
- NFR3 Lisensi MIT.
- NFR4 Stack ditentukan di desain teknis. Beban server hanya signaling sehingga ringan untuk 1 core/1 GB RAM.

## 7. Sketsa Data Model

Semua data di server bersifat sementara (memori) kecuali penghitung kuota harian dan pairing code (tetap sementara, boleh di memori atau penyimpanan ringan). Tidak ada akun dan tidak ada penyimpanan file di server.

### Device (server, in-memory)
| Field | Keterangan |
|-------|-----------|
| device_id | Acak, disimpan di localStorage |
| display_name | Nama otomatis |
| group_id | Grup IP atau grup pairing |
| group_source | auto_ip / pairing_code |
| locale | id / en |
| connected_at, last_heartbeat_at | Waktu |
| status | online / offline |

### Group
| Field | Keterangan |
|-------|-----------|
| group_id | Kunci |
| device_ids | Maks 5 |

### PairingCode
| Field | Keterangan |
|-------|-----------|
| code | 6 digit |
| group_id | Grup pembuat |
| created_at, expires_at | 24 jam |
| used_by_device_id | Terisi saat dipakai (sekali pakai) |

### TransferRequest (server, hanya metadata)
| Field | Keterangan |
|-------|-----------|
| transfer_id | Diterbitkan server |
| sender_device_id, receiver_device_id | Pihak |
| file_count, total_size_bytes | ≤ 1 GB |
| status | pending / accepted / rejected / expired / in_progress / paused / completed / failed / cancelled |
| created_at, finished_at | Waktu |

### TransferFile (di client, untuk resume)
| Field | Keterangan |
|-------|-----------|
| file_id, transfer_id | Kunci |
| file_name, size_bytes, mime_type | Metadata |
| chunk_size, chunks_total | Pembagian chunk |
| chunks_received | Ditaruh di IndexedDB/OPFS penerima |
| file_checksum | Verifikasi akhir dan pencocokan saat resume |
| status | waiting / transferring / paused / done / failed / cancelled |
| partial_expires_at | +24 jam sejak chunk terakhir |

### UsageCounter (server)
| Field | Keterangan |
|-------|-----------|
| ip | Kunci |
| date | Hari berjalan |
| files_received | Maks 10 |

## 8. Edge Case dan Failure State

| # | Kasus | Perilaku |
|---|-------|---------|
| E1 | File > 100 MB | Ditolak per file |
| E2 | Total > 1 GB | Permintaan ditolak, pengguna diminta mengurangi |
| E3 | Ekstensi diblokir | Ditolak per file dengan alasan |
| E4 | File 0 byte | Ditolak |
| E5 | Tidak ada device lain | Pesan petunjuk + tawaran kode pairing |
| E6 | Tidak terdeteksi walau satu wifi (CGNAT, IPv6, VPN, data seluler) | Gunakan kode pairing |
| E7 | Grup penuh | Pop-up kecil kanan atas: "Grup penuh" |
| E8 | Orang asing di wifi publik mengirim permintaan | Penerima tetap harus menyetujui; tampilkan nama pengirim dan daftar file |
| E9 | Penerima menolak / tidak merespons 60 dtk | "Ditolak" / "Tidak ada respons" |
| E10 | Penerima sibuk | "Penerima sedang sibuk" |
| E11 | Koneksi P2P gagal (NAT ketat/firewall, tanpa TURN) | Pesan FR9.4; transfer tidak dimulai |
| E12 | Koneksi putus saat transfer | Status "terputus"; resume otomatis |
| E13 | Refresh saat transfer | Penerima menyimpan chunk; pengirim harus memilih ulang file yang sama untuk lanjut (FR10.3) |
| E14 | Pengirim memilih file berbeda saat resume | Resume ditolak; mulai ulang dengan persetujuan baru |
| E15 | Data parsial melewati 24 jam | Dihapus; transfer harus diulang |
| E16 | Pengirim atau penerima menutup tab | Transfer diberi status terputus; resume jika kembali dalam batas 24 jam dan kondisi FR10.3 terpenuhi |
| E17 | Kuota 10 file/hari habis | Permintaan ditolak; UI menjelaskan batas dan reset 00:00 |
| E18 | Jumlah file melebihi sisa kuota | Permintaan ditolak di awal |
| E19 | Kode pairing salah/kedaluwarsa/sudah dipakai | Pesan error spesifik |
| E20 | Terlalu banyak percobaan kode salah | Diblokir sementara per IP |
| E21 | Checksum tidak cocok | Chunk diminta ulang; jika tetap gagal, file ditandai gagal |
| E22 | Storage browser penuh/dibatasi (mis. mode privat, iOS) | Pesan "Penyimpanan tidak cukup"; resume tidak tersedia |
| E23 | iOS: layar mati/tab di background | Transfer terhenti; tampilkan peringatan; resume saat kembali |
| E24 | Nama file duplikat/karakter khusus | Sanitasi + akhiran angka |
| E25 | Signaling server restart | Client koneksi ulang otomatis dan mendaftar ulang; transfer P2P yang sedang berjalan bisa tetap lanjut (data tidak lewat server) |
| E26 | Browser tidak didukung WebRTC | Pesan versi minimum |

## 9. Success Metrics

### Definisi "selesai" MVP
1. File apa pun < 100 MB: PC → Android berhasil, tanpa login.
2. PC → iPhone (Safari) berhasil.
3. Android/iPhone → PC berhasil.
4. Banyak file dalam satu permintaan (≤ 1 GB) berhasil.
5. Persetujuan penerima, progress bar, kode pairing, dan blokir ekstensi berfungsi.
6. Resume berfungsi setelah koneksi putus **dan** setelah refresh (dengan syarat FR10.3).
7. Batas 10 file/hari per IP berfungsi dan reset 00:00.
8. File tidak pernah tersimpan di server (diverifikasi dengan pemeriksaan disk/log).
9. UI ID dan EN berfungsi; default ID.
10. Server berjalan di VPS Biznetgio tanpa crash dengan 5 device terhubung.

### Metrik kuantitatif
| Metrik | Target |
|--------|--------|
| Transfer success rate (P2P terbentuk lalu selesai) | ≥ 90% di jaringan wifi yang sama (usulan) |
| Waktu sampai device terdeteksi | ≤ 3 detik (usulan) |
| Waktu P2P terbentuk setelah Terima | ≤ 5 detik (usulan) |
| Kecepatan transfer di LAN | Secepat mungkin (keinginan pemilik). Target terukur **[KEPUTUSAN PM]**: ≥ 10 MB/s pada wifi 5 GHz PC ↔ HP; file 100 MB selesai ≤ 15 detik. Kecepatan aktual dibatasi wifi dan WebRTC data channel |
| Resume berhasil setelah putus | ≥ 95% (usulan) |
| Byte file yang melewati server | 0 |
| Crash server per minggu | 0 |

Tanpa analytics, pengukuran dilakukan lewat pengujian manual dan log server minimal (tanpa isi file). Metrik pertumbuhan tidak bisa diukur.

## 10. Open Questions dan Risiko

### Open Questions

Tidak ada pertanyaan terbuka yang memblokir desain teknis. Yang masih berupa asumsi PM tertandai **[KEPUTUSAN PM]** di bagian 6 dan 9 dan boleh diubah.

Keputusan final pemilik: rilis 16 Desember 2026; bandwidth VPS 600 Mbps internasional (hanya signaling, tidak kritis); tanpa TURN; pairing bertahan saat refresh dan putus saat web ditutup; `.apk` diblokir; reset kuota 00:00 WITA; kecepatan transfer secepat mungkin (target terukur di bagian 9).

### Risiko (dicatat, bukan blocker)

| # | Risiko | Mitigasi / status |
|---|--------|------------------|
| R1 | Tanpa halaman kebijakan privasi dan ToS untuk layanan publik: risiko hukum dan kepercayaan, terutama saat memproses IP dan nama file di signaling. | Diterima untuk v1 oleh pemilik; dijadwalkan v2. |
| R2 | Kuota 10 file/hari per IP bersifat terbaik-usaha (klien dimodifikasi bisa menghindar karena data tidak lewat server). | Diterima; kuota untuk membatasi penyalahgunaan signaling, bukan jaminan keras. |
| R3 | Kuota per IP dibagi seluruh pengguna di NAT yang sama (wifi publik/kampus): 10 file/hari untuk seluruh jaringan itu. | Perlu diperhatikan; konfirmasi bila ingin per device (kebutuhan identitas device terbatas karena tanpa login). |
| R4 | Blokir ekstensi tidak mendeteksi file berbahaya yang disamarkan; tanpa pemindaian. | Diterima oleh pemilik. |
| R5 | Orang asing di wifi publik bisa melihat nama device dan mengirim permintaan. | Diterima; mitigasi: persetujuan wajib, tampilan nama pengirim dan daftar file. |
| R6 | Server signaling yang dikompromikan bisa melakukan MITM pada SDP (mengganti fingerprint DTLS). | Open source memungkinkan audit; verifikasi fingerprint manual tidak masuk v1. |
| R7 | Resume setelah refresh tidak bisa berjalan otomatis: pengirim wajib memilih ulang file. Keterbatasan browser (khususnya Safari iOS), bukan pilihan desain. | Dijelaskan di FR10.3; UI harus memandu pengguna. |
| R8 | WebRTC di Safari iOS (memori, background, penyimpanan) lebih ketat dari Chrome. | Wajib diuji di iPhone sungguhan sebelum rilis. |
| R9 | Rilis 16 Desember 2026 (30 hari dari draf ini) dengan scope WebRTC + resume setelah refresh + pairing + 2 bahasa + uji iPhone/Android. Resume setelah refresh dan kompatibilitas Safari iOS paling berisiko. | Jika terlambat, potong resume setelah refresh ke rilis 1.1; pertahankan transfer P2P, persetujuan, pairing. Keputusan ada di pemilik. |
| R10 | Tanpa TURN, transfer gagal pada jaringan dengan NAT simetris/firewall ketat (umum di sebagian wifi kantor/kampus dan data seluler). | Diterima oleh pemilik; pesan error FR9.4 dan kode pairing tidak menyelesaikan kasus ini. |

