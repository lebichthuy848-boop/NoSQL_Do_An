# Runbook clone và dựng trên máy mới

Hướng dẫn này áp dụng cho branch tích hợp. Mọi thao tác restore và kiểm thử ghi dữ liệu chỉ được chạy trên ArangoDB test mới, dùng Docker project và volume mới. Không kết nối hoặc thay đổi LIVE, DB vận hành hay clone đã nghiệm thu. Giữ cùng một cửa sổ PowerShell từ lúc tạo biến `$project` đến khi dừng Docker project.

## 1. GitHub có gì và cần cung cấp riêng gì

| Có trong branch GitHub | Cần có riêng trên máy thành viên |
|---|---|
| React + TypeScript, Node.js Backend, `package.json`, `package-lock.json`, tests, script bootstrap, AQL demo và tài liệu | Archive Batch 2 `skillgraph_v366_coverage50_batch2_20261120.tar.gz` cùng SHA-256 đã được xác nhận |
| Mẫu cấu hình chỉ chứa placeholder và hướng dẫn tạo quyền | Docker image `arangodb:3.12.11` (Docker có thể cần tải image lần đầu) |
| Không có volume Docker hay file runtime `.env` | Mật khẩu root mới cho DB test, bootstrap secret, runtime password và mật khẩu Admin/User do thành viên tự tạo; giữ trong máy riêng |

Branch tip không chứa backup hoặc secret runtime. Lịch sử GitHub trước branch này vẫn chứa dump và giá trị credential legacy trong commit tổ tiên. Không dùng lại các giá trị đó; coi chúng là đã lộ và yêu cầu chủ repo rotation. Branch này không viết lại lịch sử từ xa.

## 2. Prerequisites và clone

Cần Windows PowerShell, Git, Node.js 22+, npm và Docker Desktop đang hoạt động. Kiểm tra:

~~~powershell
node --version
npm --version
docker version
~~~

Clone branch bàn giao và cài Frontend theo lockfile:

~~~powershell
git clone --branch integration/skillgraph-stagec-20261121 --single-branch https://github.com/lebichthuy848-boop/NoSQL_Do_An.git
Set-Location .\NoSQL_Do_An
npm ci
~~~

Backend dùng Node.js built-ins, không cần `npm install` trong `backend/`. Không chạy script restore legacy `database/restore.ps1`.

## 3. Xác minh backup Batch 2

Đặt archive được cung cấp riêng ở ngoài repository, ví dụ thư mục cá nhân `C:\SkillGraphAssets`. Không chép archive vào Git working tree.

Archive được ghi nhận trong receipt:

- Tên: `skillgraph_v366_coverage50_batch2_20261120.tar.gz`
- SHA-256 mong đợi: `cf9da1eb4b34b8b42f8a6960d5499cb673b97cd131414fca31e626e758efa6ca`

Xác minh trước khi giải nén:

~~~powershell
$archive = Read-Host 'Nhập đường dẫn đầy đủ tới archive Batch 2 được cấp riêng'
$expected = 'cf9da1eb4b34b8b42f8a6960d5499cb673b97cd131414fca31e626e758efa6ca'
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'SHA-256 không khớp; dừng, không restore.' }
~~~

Giải nén vào TEMP, không giải nén đè vào thư mục dữ liệu khác:

~~~powershell
$project = 'sg-member-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0,8))
$extractRoot = Join-Path $env:TEMP $project
New-Item -ItemType Directory -Path $extractRoot | Out-Null
tar.exe -xzf $archive -C $extractRoot
$dumpInfo = @(Get-ChildItem -LiteralPath $extractRoot -Recurse -File -Filter 'dump.json')
if ($dumpInfo.Count -ne 1) { throw 'Archive không có đúng một dump.json; dừng và kiểm tra gói được cấp.' }
$dumpDirectory = $dumpInfo[0].Directory.FullName
Write-Output "Test project name: $project"
~~~

Nếu hash sai, thiếu `dump.json`, hoặc archive không đọc được thì dừng tại đây. Không dùng dump cũ đang có trong Git history.

## 4. Tạo ArangoDB test mới và restore

Compose file trong `database/docker-compose.yml` là template không chứa mật khẩu. Project name duy nhất sẽ tạo container và named volume riêng. Không bỏ `-p $project`, không dùng tên project/volume cũ.

Tạo secret file local bị Git ignore, sinh mật khẩu ngẫu nhiên và giới hạn ACL cho tài khoản Windows hiện tại:

~~~powershell
New-Item -ItemType Directory -Path .secrets -Force | Out-Null
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rootPassword = [Convert]::ToBase64String($bytes)
$secretFile = Join-Path $PWD '.secrets/arangodb.env'
@("ARANGO_ROOT_PASSWORD=$rootPassword", 'ARANGO_TEST_PORT=39529') | Set-Content -LiteralPath $secretFile
$identity = "$env:USERDOMAIN\$env:USERNAME"
icacls $secretFile /inheritance:r /grant:r "${identity}:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Không đặt được ACL cho secret file.' }
Remove-Variable bytes,rng,rootPassword
~~~

Secret file chứa mật khẩu dạng plaintext để Docker đọc; nó bị ignore và ACL chỉ cấp quyền cho tài khoản máy hiện tại. Không mở, in hoặc commit file. Kiểm tra port test còn trống; nếu 39529 đang dùng, chọn port loopback khác trong file này rồi dùng cùng port ở cấu hình Backend.

Tạo Docker project mới. Docker khởi tạo DB với authentication bật ngay từ đầu:

~~~powershell
docker compose --env-file .secrets/arangodb.env --project-name $project --file database/docker-compose.yml up -d
$container = (docker compose --env-file .secrets/arangodb.env --project-name $project --file database/docker-compose.yml ps -q arangodb).Trim()
if (-not $container) { throw 'Không tìm thấy container thuộc Docker project mới.' }
docker compose --env-file .secrets/arangodb.env --project-name $project --file database/docker-compose.yml port arangodb 8529
~~~

Port mapping phải bắt đầu bằng `127.0.0.1:`. Lệnh compose tạo một named volume mới theo project name. Không gắn volume cũ và không publish lên LAN.

Đọc root password vào biến mà không in ra, chép dump vào container test rồi restore vào database mới. Lệnh restore không dùng `--overwrite`:

~~~powershell
$rootSettings = @{}
foreach ($line in Get-Content -LiteralPath $secretFile) {
  if ($line -match '=') { $i = $line.IndexOf('='); $rootSettings[$line.Substring(0,$i)] = $line.Substring($i+1) }
}
$rootPassword = $rootSettings['ARANGO_ROOT_PASSWORD']
docker cp $dumpDirectory ("{0}:/tmp/skillgraph-batch2" -f $container)
docker exec $container arangorestore `
  '--server.endpoint=tcp://127.0.0.1:8529' `
  '--server.username=root' `
  "--server.password=$rootPassword" `
  '--server.database=skill_graph_v366_acceptance' `
  '--create-database=true' `
  '--input-directory=/tmp/skillgraph-batch2'
if ($LASTEXITCODE -ne 0) { throw 'Restore lỗi; không chạy bootstrap. Chỉ xử lý Docker project test mới.' }
~~~

Mật khẩu chỉ được đọc vào biến local và không được ghi vào log; không chụp màn hình hoặc chia sẻ command transcript trong lúc restore. Xác minh unauthenticated API bị từ chối:

~~~powershell
$unauthStatus = $null
try { Invoke-WebRequest "http://127.0.0.1:39529/_api/version" -TimeoutSec 5 -ErrorAction Stop | Out-Null }
catch { if ($_.Exception.Response) { $unauthStatus = [int]$_.Exception.Response.StatusCode } }
if ($unauthStatus -ne 401) { throw 'ArangoDB chưa chứng minh được authentication; dừng và không khởi động ứng dụng.' }
~~~

Đăng nhập ArangoDB Web UI tại `http://127.0.0.1:39529` bằng root secret cục bộ, chọn `skill_graph_v366_acceptance`. Không đưa credential vào URL.

## 5. Tạo runtime user giới hạn quyền

Tạo backend bootstrap secret cục bộ từ root secret và một runtime password ngẫu nhiên mới. Ví dụ dưới đây ghi file chỉ trong `backend/.secrets/`, bị Git ignore:

~~~powershell
$backendSecrets = Join-Path $PWD 'backend/.secrets'
New-Item -ItemType Directory -Path $backendSecrets -Force | Out-Null
$runtimeBytes = New-Object byte[] 32
$runtimeRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$runtimeRng.GetBytes($runtimeBytes)
$runtimePassword = [Convert]::ToBase64String($runtimeBytes)
$bootstrapFile = Join-Path $backendSecrets 'bootstrap.env'
@(
  'ARANGO_URL=http://127.0.0.1:39529'
  'ARANGO_DATABASE=skill_graph_v366_acceptance'
  'ARANGO_BOOTSTRAP_USERNAME=root'
  "ARANGO_BOOTSTRAP_PASSWORD=$($rootSettings['ARANGO_ROOT_PASSWORD'])"
  'ARANGO_RUNTIME_USERNAME=skillgraph_backend_runtime'
  "ARANGO_RUNTIME_PASSWORD=$runtimePassword"
) | Set-Content -LiteralPath $bootstrapFile
icacls $bootstrapFile /inheritance:r /grant:r "${identity}:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Không đặt được ACL cho bootstrap secret.' }
Remove-Variable runtimeBytes,runtimeRng,runtimePassword
~~~

Nếu đã chọn port DB khác 39529, sửa `ARANGO_URL` trong bootstrap file thành port đó trước khi chạy bước sau.

Chạy bootstrap chỉ với DB test mới:

~~~powershell
Set-Location .\backend
node --env-file-if-exists=.secrets/bootstrap.env src/bootstrap-db.mjs
.\scripts\prepare-runtime-env.ps1
~~~

Bootstrap tạo tám collection/index `app_*`, tạo user runtime riêng, cấp `ro` ở database và `rw` chỉ cho tám collection ứng dụng: `app_users`, `app_sessions`, `app_password_resets`, `app_profiles`, `app_audit_log`, `app_resource_drafts`, `app_provider_drafts`, `app_mapping_drafts`. Nó kiểm tra đọc catalog và tạo/xóa một audit record `is_test`; các collection lõi không được ghi.

`prepare-runtime-env.ps1` tạo `backend/.env` từ runtime credentials, không chép root password. Nếu port DB khác 39529, sửa `ARANGO_URL` trong `backend/.env` và giữ host Backend là `127.0.0.1`, port Backend là 39530, origin Frontend là `http://127.0.0.1:5174`.

## 6. Tạo tài khoản và chạy ứng dụng

Khi vẫn ở thư mục `backend`, tạo Admin đầu tiên bằng terminal tương tác:

~~~powershell
node --env-file-if-exists=.secrets/bootstrap.env src/cli.mjs create-initial-admin
~~~

CLI hỏi email, tên hiển thị và nhập mật khẩu ẩn. Dùng email thử nghiệm thuộc miền `.invalid` nếu không muốn gắn email thật. CLI từ chối tạo Admin thứ hai khi đã có Admin active. Không đặt mật khẩu mẫu dùng chung.

Khởi động Backend:

~~~powershell
npm start
~~~

Trong cửa sổ PowerShell thứ hai, từ thư mục gốc:

~~~powershell
Set-Location -LiteralPath (Read-Host 'Nhập đường dẫn thư mục clone NoSQL_Do_An')
npm run dev -- --host 127.0.0.1 --port 5174
~~~

Mở `http://127.0.0.1:5174`, đăng nhập Admin vừa tạo. Tạo User demo qua trang đăng ký với email giả lập như `demo-member1@example.invalid` và mật khẩu cục bộ riêng. Public registration luôn cấp role `user`; không nhập role Admin trong form.

Kiểm tra API health và thông tin ArangoDB:

~~~powershell
Invoke-RestMethod http://127.0.0.1:39530/api/v1/health | ConvertTo-Json
$release = Invoke-RestMethod http://127.0.0.1:39530/api/v1/meta/release
$release | Select-Object arangoVersion,database,careers,skills,courses,requiresSkillRelations
if ($release.arangoVersion -ne '3.12.11' -or $release.careers -ne 12 -or $release.skills -ne 420 -or $release.courses -ne 510) {
  throw 'Release counts/version không khớp Batch 2; dừng và kiểm tra DB/port.'
}
~~~

Nếu đổi port Backend khỏi 39530 thì phải sửa đồng thời `backend/.env` và Vite proxy trong `vite.config.ts`; mặc định giữ nguyên để tránh sai origin/CORS.

## 7. Checklist integrity, dữ liệu và recommendation gates

Chỉ chạy các bước sau sau khi restore vào DB test mới. Không chạy mutation API để kiểm tra catalog.

- Archive SHA-256 khớp chính xác giá trị ở mục 3.
- API release trả ArangoDB 3.12.11, `careers = 12`, `skills = 420`, `courses = 510`.
- Baseline Batch 2 trước bootstrap có 25 collection lõi, 5.990 document/edge, 3.099 edge và 13 edge definition. Sau bootstrap sẽ có thêm tám `app_*` collections; chúng không thay thế hoặc sửa collection lõi.
- Mở `backend/scripts/demo-queries.aql` trong ArangoDB Web Interface. Stage C receipt ghi 12 truy vấn GUI lịch sử. Query 13 là AQL chỉ đọc; không được xác nhận chạy trong GUI của đợt final release. API/audit kiểm tra gate không thay cho ảnh GUI.
- Query 13 dự kiến trả `totalCourseCount = 510`, `eligibleCourseCount = 173`, `allowedMappingCount = 245`, `invalidAllowedMappingCount = 0`, `eligibleCoursesWithoutAllowedMapping = 0`. Cần chạy và chụp ảnh riêng nếu dùng làm minh chứng GUI.
- Recommendation chỉ hợp lệ nếu đồng thời `courses.recommendation_eligible == true` và `teaches.auto_recommendation_allowed == true`. Không bật gate hoặc sửa dữ liệu lõi để ép kết quả.
- Nếu số liệu khác, dừng demo và so lại hash/DB/port. Không chạy migration hay restore lần nữa trên volume có dữ liệu cần giữ.

## 8. Build, tests và giới hạn bằng chứng

Sau khi cài dependency, các kiểm tra không ghi DB:

~~~powershell
npm test
npm run build
npm test --prefix backend
npm run build --prefix backend
git diff --check
~~~

Không chạy `npm run integration --prefix backend` hoặc Browser E2E trên DB vận hành. Các suite đó tạo User/session/audit/draft test data. Chỉ dùng DB test riêng được nêu trong runbook.

Biên bản Stage C còn ghi các giới hạn: Admin Browser E2E đầy đủ chưa được rerun sau sửa cuối; forgot-password chưa có email adapter; Catalog lõi chỉ đọc; một số thao tác hồ sơ/Admin chưa có E2E evidence đầy đủ; bundle Frontend có cảnh báo chunk lớn hơn 500 kB. Hướng dẫn này chưa được chạy từ đầu trên máy sạch, vì vậy chưa thể tuyên bố một máy mới đã dựng thành công.

## Final release integrity và Import/Export

Từ workspace root, chỉ chạy trên container E2E `skillgraph-v366-e2e-20261121-db-loopback` và DB `skill_graph_v366_acceptance`. Các script từ chối endpoint/database/runtime principal khác. File runtime bị Git ignore và ACL khóa; không in hoặc chia sẻ nội dung.

Read-only integrity audit (không ghi Database):

```powershell
node --env-file=backend/.env.e2e-20261121-runtime backend/scripts/audit-e2e-integrity.mjs
```

Import/export kiểm chứng một record test trong `app_audit_log`, đối chiếu lại rồi tự cleanup; không nhắm core collections:

```powershell
node --env-file=backend/.env.e2e-20261121-runtime backend/scripts/import-export-e2e-test.mjs
```

Bản audit đã chạy và lọc credential/record content được lưu tại `docs/evidence/integrity-audit-e2e-2026-11-21.json`. Nó cho thấy source/live canonical content khớp, đồng thời ghi rõ ba stored fingerprints không tái lập được bằng canonical method hiện tại. Archive lịch sử không còn ở workspace để re-hash; không chạy restore trên volume demo.

## 9. Lỗi thường gặp

| Triệu chứng | Hướng xử lý |
|---|---|
| SHA không khớp hoặc không tìm thấy `dump.json` | Dừng restore; xin lại archive đúng Batch 2 và kiểm tra SHA. Không dùng dump legacy trong Git history. |
| Container báo mật khẩu không đúng sau khi đổi secret | Docker chỉ áp dụng `ARANGO_ROOT_PASSWORD` khi khởi tạo volume lần đầu. Giữ nguyên secret với volume hiện tại hoặc tạo project/volume test mới; không gắn volume khác. |
| Port 39529 đang được dùng | Chọn port loopback còn trống, sửa `ARANGO_TEST_PORT`, `ARANGO_URL` trong bootstrap và `.env`. Không bind ra LAN. |
| Restore lỗi hoặc DB đã có collection | Dừng; xác minh container thuộc project name mới và volume hoàn toàn mới. Không dùng `--overwrite` hoặc xóa volume khác. |
| Bootstrap báo thiếu quyền | Kiểm tra `ARANGO_URL`, tên database, bootstrap credential và quyền root trên DB test. Không thay runtime user bằng root. |
| API health lỗi hoặc release không đủ 12/420/510 | Xác minh Backend đang trỏ đúng port/database; so hash và chạy lại query đọc. Không sửa Catalog lõi. |
| Mutation trả 403 | Origin phải đúng `http://127.0.0.1:5174`; kiểm tra `ALLOWED_ORIGINS` trong `backend/.env` và không đổi Vite port ngoài kế hoạch. |
| Quên mật khẩu trả 503 | Đây là trạng thái dự kiến khi chưa cấu hình email; tính năng gửi thư chưa có. |
| CLI báo đã có Admin active | Dùng tài khoản Admin hiện có; không thêm Admin đầu bằng script lần nữa. |
| Vite cảnh báo bundle trên 500 kB | Build vẫn có thể thành công; đây là cảnh báo tối ưu, không phải lỗi API/DB. |

## 10. Dừng môi trường test

Dừng terminal Backend và Vite bằng Ctrl+C. Trong thư mục gốc, dùng đúng project name đã lưu trong biến `$project`:

~~~powershell
docker compose --env-file .secrets/arangodb.env --project-name $project --file database/docker-compose.yml stop
~~~

Lệnh trên chỉ dừng container của project test mới và giữ volume để mở lại. Không chạy `docker compose down -v`, `docker volume rm`, `docker system prune` hoặc lệnh xóa volume trong quá trình bàn giao. Giữ secret file cục bộ nếu còn dùng volume; không commit file đó.
