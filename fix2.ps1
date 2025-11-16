$file = "server.js"
$content = Get-Content $file -Raw

# Step 1: Change status from 'deployed' to 'pending' in the produce-from-order section
$pattern1 = "status: 'deployed',\s+deployedAt: now,"
$replacement1 = "status: 'pending',"
$content = $content -replace $pattern1, $replacement1

# Step 2: Remove the order completion update
$pattern2 = "(?s)\s+await futureOrdersCollection\.updateOne\([^)]+\);\s+"
$replacement2 = "`n`n"
if ($content -match "futureOrdersCollection\.updateOne") {
    $lines = $content -split "`n"
    $newLines = @()
    $skip = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "await futureOrdersCollection\.updateOne" -and $lines[$i+3] -match "completedAt") {
            $skip = 3
            continue
        }
        if ($skip -gt 0) {
            $skip--
            continue
        }
        $newLines += $lines[$i]
    }
    $content = $newLines -join "`n"
}

# Step 3: Fix success messages
$content = $content -replace "Produced and dispatched", "Produced"
$content = $content -replace "movedTo: 'history'", "movedTo: 'active'"

Set-Content $file -Value $content -NoNewline
Write-Host "Done! Check server.js"
