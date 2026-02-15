# Script para aplicar migrações no banco de produção (Cloud SQL via proxy)
# Uso: .\prisma-migrate-cloud.ps1
# Certifique-se de que o cloud-sql-proxy está rodando e DATABASE_URL está correta

$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://postgres:admin@localhost:5432/dbdbbot" }

$maxAttempts = 30
$attempt = 0

while ($attempt -lt $maxAttempts) {
    $attempt++
    Write-Host "`n=== Tentativa $attempt de $maxAttempts ===" -ForegroundColor Cyan
    Write-Host "Executando: npx prisma migrate deploy`n" -ForegroundColor Gray

    $output = npx prisma migrate deploy 2>&1 | Out-String
    Write-Host $output

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nMigrações aplicadas com sucesso!" -ForegroundColor Green
        exit 0
    }

    # Extrair nome da migração que falhou (vários formatos de erro do Prisma)
    $migrationName = $null
    if ($output -match "Migration name:\s*(\S+)") {
        $migrationName = $Matches[1].Trim()
    }
    elseif ($output -match '`(\d{14}_[a-zA-Z0-9_]+)`') {
        $migrationName = $Matches[1].Trim()
    }
    elseif ($output -match "(\d{14}_[a-zA-Z0-9_]+)") {
        $migrationName = $Matches[1].Trim()
    }

    if ($migrationName) {
        Write-Host "`nMarcando migração como aplicada: $migrationName" -ForegroundColor Yellow
        npx prisma migrate resolve --applied $migrationName 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK. Tentando deploy novamente..." -ForegroundColor Green
        }
        else {
            Write-Host "Erro ao marcar migração. Abortando." -ForegroundColor Red
            exit 1
        }
    }
    else {
        Write-Host "`nFalha na migração mas não foi possível identificar qual. Verifique o erro acima." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nNúmero máximo de tentativas atingido." -ForegroundColor Red
exit 1
