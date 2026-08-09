<#
.SYNOPSIS
    Backup manual da base de dados MySQL (producao ou qualquer ambiente) via mysqldump.

.DESCRIPTION
    Le a connection string de uma VARIAVEL DE AMBIENTE (nunca de um argumento na
    linha de comando, que ficaria gravado no historico do PowerShell), faz o
    parsing do formato mysql://user:pass@host:port/dbname, e corre o mysqldump
    passando a password atraves de um ficheiro --defaults-extra-file temporario
    (nunca como --password=xxx visivel, nunca impressa no ecra).

    NUNCA imprime a password, nem a connection string, nem o utilizador. No fim,
    so mostra o nome do ficheiro .sql gerado e o respetivo tamanho.

.COMO DEFINIR A VARIAVEL DE AMBIENTE SEM A DEIXAR NO HISTORICO
    O PowerShell (via PSReadLine) grava por omissao cada comando que escreves no
    ficheiro de historico -- incluindo o valor literal se fizeres
    $env:PROD_DATABASE_URL = "mysql://user:password@host:3306/db" diretamente.
    Para NAO deixar a password no historico, cola-a de forma mascarada:

        $secure = Read-Host "Cola a DATABASE_URL de producao" -AsSecureString
        $env:PROD_DATABASE_URL = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        )

    Read-Host -AsSecureString nao ecoa o que escreves no ecra e, por ser uma
    RESPOSTA a um prompt (entrada, nao comando), o PSReadLine nao a grava no
    ficheiro de historico -- so o comando Read-Host em si e que fica la, nunca
    o valor colado.

    A variavel so existe NESTA sessao do PowerShell -- fecha a janela e
    desaparece (nao fica em disco, ao contrario de um .env).

.COMO CORRER
    .\scripts\backup-db.ps1
    (opcional) .\scripts\backup-db.ps1 -OutputDir "D:\backups-cisplan"

.DEPOIS DE CORRER
    - Copia o ficheiro .sql gerado (pasta backups\ por omissao) para o Google
      Drive manualmente.
    - O .sql contem TODOS os dados de producao (empresas, utilizadores, scans,
      vulnerabilidades) -- trata-o como CONFIDENCIAL. Nunca o commites ao git
      (a pasta backups\ e o padrao *.sql ja estao no .gitignore do repo).
    - Depois de confirmar a copia para o Drive, podes apagar a copia local se
      quiseres poupar espaco -- o script nao apaga nada sozinho.

.REQUISITO -- mysqldump
    Faz parte das MySQL Command-Line Client Tools. Confirma que esta disponivel:
        mysqldump --version
    Se nao estiver instalado, a forma mais simples no Windows e instalar a
    partir de:
        https://dev.mysql.com/downloads/mysql/
    (escolhe o instalador "MySQL Installer for Windows"; nas opcoes de setup,
    o componente "MySQL Command Line Client" / "Client Utilities" inclui o
    mysqldump.exe). Depois de instalado, garante que a pasta com mysqldump.exe
    esta no PATH (o instalador normalmente ja trata disto).
#>

[CmdletBinding()]
param(
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# 1. Confirmar que o mysqldump esta disponivel
# ---------------------------------------------------------------------------

$mysqldump = Get-Command mysqldump -ErrorAction SilentlyContinue
if (-not $mysqldump) {
    Write-Error @'
mysqldump nao foi encontrado no PATH.
Instala as MySQL Command-Line Client Tools (ver comentario .REQUISITO no topo
deste script) e volta a tentar. Confirma com: mysqldump --version
'@
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Ler a connection string da variavel de ambiente (nunca de um argumento)
# ---------------------------------------------------------------------------

$connStr = $env:PROD_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($connStr)) {
    Write-Error @'
A variavel de ambiente PROD_DATABASE_URL nao esta definida nesta sessao.

Define-a primeiro (sem a deixar no historico do PowerShell):

    $secure = Read-Host "Cola a DATABASE_URL de producao" -AsSecureString
    $env:PROD_DATABASE_URL = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )

Depois volta a correr este script.
'@
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Parsing da URI mysql://user:pass@host:port/dbname
#    (System.Uri trata corretamente user/pass com caracteres especiais
#    codificados em URL -- mais fiavel do que separar a string a mao)
# ---------------------------------------------------------------------------

try {
    $uri = [System.Uri]$connStr
    $userInfoParts = $uri.UserInfo.Split(":", 2)
    if ($userInfoParts.Count -lt 2) {
        throw "Connection string sem password no formato user:pass@host."
    }
    $mysqlUser     = [System.Uri]::UnescapeDataString($userInfoParts[0])
    $mysqlPassword = [System.Uri]::UnescapeDataString($userInfoParts[1])
    $mysqlHost     = $uri.Host
    $mysqlPort     = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
    $dbName        = $uri.AbsolutePath.TrimStart("/")

    if ([string]::IsNullOrWhiteSpace($mysqlHost) -or [string]::IsNullOrWhiteSpace($dbName)) {
        throw "Host ou nome da base de dados vazios apos o parsing."
    }
}
catch {
    # Nunca incluir $connStr na mensagem de erro -- so o tipo de falha.
    Write-Error "Nao foi possivel interpretar PROD_DATABASE_URL como mysql://user:pass@host:port/db. Confirma o formato (sem revelar o valor aqui)."
    exit 1
}
finally {
    # Ja nao precisamos da string completa em memoria a partir daqui.
    Remove-Variable connStr -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 4. Preparar a pasta e o nome do ficheiro de saida
# ---------------------------------------------------------------------------

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
$OutputDir = (Resolve-Path $OutputDir).Path

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$outFile   = Join-Path $OutputDir "cisplan_backup_$timestamp.sql"

# ---------------------------------------------------------------------------
# 5. Passar a password ao mysqldump SEM a expor -- ficheiro --defaults-extra-file
#    temporario (nunca --password=xxx visivel na linha de comando/historico
#    de processos). Ficheiro apagado no finally, mesmo se o dump falhar.
# ---------------------------------------------------------------------------

$tempIni = [System.IO.Path]::GetTempFileName()
try {
    @"
[client]
user=$mysqlUser
password=$mysqlPassword
host=$mysqlHost
port=$mysqlPort
"@ | Set-Content -Path $tempIni -Encoding ASCII -NoNewline

    # Restringe o ficheiro temporario so ao utilizador atual (defesa extra --
    # contem a password em texto limpo durante segundos).
    try {
        icacls $tempIni /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    } catch {
        # Nao critico -- o ficheiro e apagado de seguida de qualquer forma.
    }

    Write-Host "A iniciar o backup..."

    # --defaults-extra-file TEM de ser o primeiro argumento.
    & mysqldump `
        "--defaults-extra-file=$tempIni" `
        --single-transaction `
        --routines `
        --triggers `
        --events `
        --default-character-set=utf8mb4 `
        $dbName `
        > $outFile
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -or -not (Test-Path $outFile) -or (Get-Item $outFile).Length -eq 0) {
        if (Test-Path $outFile) { Remove-Item $outFile -Force -ErrorAction SilentlyContinue }
        Write-Error "mysqldump falhou (codigo $exitCode). Nenhum ficheiro de backup valido foi gerado."
        exit 1
    }
}
finally {
    Remove-Item $tempIni -Force -ErrorAction SilentlyContinue
    Remove-Variable mysqlPassword -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 6. Confirmacao -- SO o nome do ficheiro e o tamanho, nunca credenciais
# ---------------------------------------------------------------------------

$sizeBytes = (Get-Item $outFile).Length
$sizeLabel = if ($sizeBytes -ge 1MB) { "{0:N1} MB" -f ($sizeBytes / 1MB) } else { "{0:N0} KB" -f ($sizeBytes / 1KB) }

Write-Host ""
Write-Host "Backup concluido com sucesso." -ForegroundColor Green
Write-Host "  Ficheiro: $outFile"
Write-Host "  Tamanho:  $sizeLabel"
Write-Host ""
Write-Host "Proximo passo: copia este ficheiro para o Google Drive." -ForegroundColor Yellow
Write-Host "Contem todos os dados de producao -- trata-o como confidencial." -ForegroundColor Yellow
