# Script to run the migration to move auth to profiles table
# Usage: .\scripts\run-migration.ps1

Write-Host "=== AliMind Migration: Move Auth to Profiles ===" -ForegroundColor Cyan
Write-Host ""

# Prompt for database password securely
$securePassword = Read-Host "Enter Supabase database password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $encodedPassword = [uri]::EscapeDataString($password)
    $env:SUPABASE_DB_URL = "postgresql://postgres.rbhnuceijvrfwjydeaqb:$encodedPassword@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
    
    Write-Host "Connection configured. Running migration..." -ForegroundColor Yellow
    Write-Host ""
    
    # Run the migration
    npx supabase db push --remote="$env:SUPABASE_DB_URL" --skip-vault
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Migration completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Seed accounts created:" -ForegroundColor Cyan
        Write-Host "  Test User:"
        Write-Host "    Email: alimind.pipeline.test@example.com"
        Write-Host "    Password: DishGen-Lab!2026-Basil-Mango"
        Write-Host "    Role: user"
        Write-Host ""
        Write-Host "  Reviewer Account:"
        Write-Host "    Email: reviewer@example.com"
        Write-Host "    Password: ReviewFlow!2026-Secure"
        Write-Host "    Role: reviewer"
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "✗ Migration failed. Check the error above." -ForegroundColor Red
        Write-Host ""
    }
    
    # Clean up environment variable
    Remove-Item Env:SUPABASE_DB_URL -ErrorAction SilentlyContinue
    
} catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
} finally {
    # Securely clear password from memory
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Variable password, encodedPassword, securePassword, passwordPointer -ErrorAction SilentlyContinue
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
