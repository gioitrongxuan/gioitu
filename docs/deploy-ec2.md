# Deploy lên EC2 với CI/CD tự động

Mỗi lần push lên `main`, GitHub Actions sẽ: chạy test → build image → đẩy lên
GHCR → SSH vào EC2 pull image mới và khởi động lại. Caddy tự lo HTTPS.

```
push main ─► [test] ─► [build & push GHCR] ─► [SSH deploy: pull + up -d] ─► Caddy (Let's Encrypt)
```

Các file liên quan:

| File | Vai trò |
|------|---------|
| `.github/workflows/ci.yml` | Chạy test cho PR và push nhánh (cổng chặn trước merge) |
| `.github/workflows/deploy.yml` | Test → build/push GHCR → deploy khi push `main` |
| `docker-compose.prod.yml` | Ngăn xếp production: app (từ GHCR) + Postgres + Caddy |
| `Caddyfile` | Reverse proxy + HTTPS tự động |
| `.env.prod.example` | Mẫu cấu hình; copy thành `.env` trên EC2 |

Làm **một lần** các bước dưới đây. Sau đó chỉ cần push `main` là web tự cập nhật.

---

## 1. Tạo EC2 instance

1. AWS Console → EC2 → **Launch instance**.
2. **AMI**: Ubuntu Server 24.04 LTS.
3. **Instance type**: `t3.small` (2 GB RAM) khuyến nghị. Có thể dùng `t2.micro`/
   `t3.micro` (free tier, 1 GB) — nhớ thêm swap ở bước 2.
4. **Key pair**: tạo/chọn key để bạn tự SSH vào quản trị (khác với deploy key ở
   bước 3).
5. **Security group** — mở inbound:
   - `22/tcp` (SSH) — nên giới hạn về IP của bạn.
   - `80/tcp` (HTTP — Caddy cần để xin chứng chỉ và redirect sang HTTPS).
   - `443/tcp` (HTTPS).
6. Launch. Ghi lại **Public IPv4** (nên gắn Elastic IP để IP không đổi khi reboot).

SSH vào để làm các bước sau:

```bash
ssh -i your-admin-key.pem ubuntu@<PUBLIC_IP>
```

## 2. Cài Docker trên EC2

```bash
# Docker Engine + plugin compose (lệnh `docker compose`)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker          # áp dụng group ngay, khỏi logout

# (Chỉ với instance 1 GB) thêm 2 GB swap để pull/chạy ổn định
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

docker compose version   # xác nhận đã có compose
```

## 3. Tạo SSH deploy key cho GitHub Actions

Khóa **riêng** chỉ dùng cho việc deploy (không nhập passphrase để Actions dùng tự động):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gioitu_deploy -N "" -C "github-actions-deploy"

# Cho phép khóa này đăng nhập vào chính EC2
cat ~/.ssh/gioitu_deploy.pub >> ~/.ssh/authorized_keys

# In khóa RIÊNG — copy toàn bộ để dán vào GitHub Secret EC2_SSH_KEY ở bước 7
cat ~/.ssh/gioitu_deploy
```

## 4. Đăng nhập GHCR trên EC2 (để pull image)

Image trên GHCR mặc định **private**. Đăng nhập **một lần** trên EC2; thông tin
được lưu lại nên các lần deploy sau pull được luôn.

1. Tạo **Personal Access Token (classic)** tại GitHub → Settings → Developer
   settings → Tokens (classic), chọn quyền **`read:packages`**.
2. Trên EC2:

```bash
echo "<PAT_read_packages>" | docker login ghcr.io -u gioitrongxuan --password-stdin
```

> Cách khác: sau lần build đầu, vào GitHub → repo → Packages → `gioitu` →
> Package settings → đổi visibility sang **Public**, khi đó EC2 pull không cần
> đăng nhập. Dùng cách này nếu bạn không ngại image công khai.

## 5. Chuẩn bị thư mục deploy + file `.env`

Workflow sẽ copy `docker-compose.prod.yml` và `Caddyfile` vào `~/gioitu` mỗi lần
deploy, nên bạn chỉ cần tạo sẵn thư mục và file `.env` (file `.env` **không** bị
ghi đè vì không nằm trong danh sách copy):

```bash
mkdir -p ~/gioitu && cd ~/gioitu

cat > .env <<'EOF'
DOMAIN=app.example.com
POSTGRES_PASSWORD=$(openssl rand -hex 24)
GIOITU_JWT_SECRET=$(openssl rand -hex 32)
EOF
# Mở .env sửa DOMAIN thành domain thật của bạn:
nano .env
```

> Lưu ý: dấu nháy đơn quanh `'EOF'` khiến `$(openssl ...)` **không** chạy. Hãy
> chạy `openssl rand -hex 24` / `-hex 32` riêng rồi dán giá trị vào, hoặc bỏ
> nháy đơn (`<<EOF`) để shell tự sinh. Cốt yếu: `POSTGRES_PASSWORD` và
> `GIOITU_JWT_SECRET` phải là chuỗi ngẫu nhiên mạnh.

## 6. Trỏ domain về EC2

Tại nhà cung cấp DNS, tạo bản ghi **A**: `app.example.com → <PUBLIC_IP>`. Đợi
DNS lan truyền (`dig +short app.example.com` trả về đúng IP) trước khi deploy,
nếu không Caddy sẽ chưa xin được chứng chỉ.

## 7. Khai báo GitHub Secrets

GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Giá trị |
|--------|---------|
| `EC2_HOST` | Public IPv4 (hoặc domain) của EC2 |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Toàn bộ nội dung khóa **riêng** `~/.ssh/gioitu_deploy` (gồm cả dòng `BEGIN/END`) |

> `GITHUB_TOKEN` để push lên GHCR là **tự động**, không cần khai báo.

## 8. Kích hoạt: merge vào `main`

Đưa nhánh hiện tại (chứa các file CI/CD này) vào `main`. Ngay khi `main` có commit
mới:

1. GitHub → tab **Actions** → workflow **Deploy** chạy: `test → build-and-push →
   deploy`.
2. Lần đầu Caddy xin chứng chỉ mất vài chục giây. Sau đó mở `https://app.example.com`.

Từ đây, **mỗi push lên `main`** = web tự cập nhật.

---

## Vận hành

```bash
cd ~/gioitu

# Xem log
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f caddy   # gỡ lỗi chứng chỉ

# Trạng thái / khởi động lại tay
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml up -d

# Rollback về một bản build cũ: thêm dòng sau vào .env rồi `up -d`
#   GIOITU_IMAGE=ghcr.io/gioitrongxuan/gioitu:<sha-commit-cu>

# Backup Postgres
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U gioitu gioitu > backup-$(date +%F).sql
```

## Khắc phục sự cố

- **Caddy không lấy được chứng chỉ**: kiểm tra DNS đã trỏ đúng IP và Security
  Group đã mở `80` + `443`. Xem `logs -f caddy`.
- **EC2 pull image lỗi `denied`/`unauthorized`**: chưa `docker login ghcr.io`
  (bước 4) hoặc PAT hết hạn / thiếu `read:packages`.
- **Bước deploy lỗi SSH**: kiểm tra `EC2_SSH_KEY` là khóa **riêng** đầy đủ và
  public key tương ứng đã nằm trong `~/.ssh/authorized_keys` trên EC2.
- **Hết RAM khi chạy** (instance 1 GB): đảm bảo đã bật swap (bước 2).
