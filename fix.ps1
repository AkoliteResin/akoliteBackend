$file = "server.js"
$content = Get-Content $file -Raw

# Replace status: 'deployed' with status: 'pending' for the produce-from-order section
$content = $content -replace "(?s)(if \(orderId && ObjectId\.isValid\(orderId\)\) \{.*?status: )'deployed'", '$1''pending'''

# Remove deployedAt: now, line
$content = $content -replace "\s*deployedAt: now,\s*\n", "`n"

# Remove the updateMany for order completion
$content = $content -replace "(?s)\s+await futureOrdersCollection\.updateOne\(\s*\{ _id: new ObjectId\(orderId\) \},\s*\{ \$set: \{ status: 'completed', completedAt: now, fulfilledQty: Number\(litres\) \} \}\s*\);", ""

# Fix the success message
$content = $content -replace "Produced and dispatched", "Produced"
$content = $content -replace "movedTo: 'history'", "movedTo: 'active'"

Set-Content $file -Value $content -NoNewline
Write-Host "✅ Updated server.js: produce-from-order now creates PENDING records in Active Orders"
