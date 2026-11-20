$ErrorActionPreference = 'Stop'

$databaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$databaseName = 'skill_graph_v366_acceptance'
$rootPassword = 'skillgraph-root-123456'
$appUsername = 'skillgraph_auth'
$appPassword = 'skillgraph-auth-123456'

Push-Location $databaseDir
try {
  docker compose up -d

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    docker compose exec -T arangodb arangosh --server.database _system --server.username root --server.password $rootPassword --javascript.execute-string "print('ready')" *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'ArangoDB không sẵn sàng sau 30 giây. Hãy kiểm tra Docker Desktop.'
  }

  docker compose exec -T arangodb arangorestore --server.database $databaseName --server.username root --server.password $rootPassword --create-database true --input-directory /dump --overwrite true
  if ($LASTEXITCODE -ne 0) {
    throw 'Không restore được database.'
  }

  $createUser = "const users=require('@arangodb/users'); try { users.save('$appUsername','$appPassword',true); } catch (e) { users.update('$appUsername','$appPassword',true); } users.grantDatabase('$appUsername','$databaseName','rw'); print('application user ready');"
  docker compose exec -T arangodb arangosh --server.database _system --server.username root --server.password $rootPassword --javascript.execute-string $createUser
  if ($LASTEXITCODE -ne 0) {
    throw 'Database đã restore nhưng không tạo được application user.'
  }

  Write-Host ''
  Write-Host 'Đã restore SkillGraph DB thành công.' -ForegroundColor Green
  Write-Host 'ArangoDB UI: http://localhost:8530'
  Write-Host 'Website Admin: admin / 123456'
  Write-Host 'Tiếp theo: copy server/auth/.env.example thành server/auth/.env rồi chạy npm run auth:dev và npm run dev.'
}
finally {
  Pop-Location
}
