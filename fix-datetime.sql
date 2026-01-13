-- Fix invalid datetime values in user table
UPDATE user 
SET updatedAt = NOW() 
WHERE updatedAt IS NULL 
   OR updatedAt = '0000-00-00 00:00:00' 
   OR YEAR(updatedAt) = 0 
   OR MONTH(updatedAt) = 0 
   OR DAY(updatedAt) = 0;

-- Also fix any other potential datetime issues
UPDATE user 
SET createdAt = NOW() 
WHERE createdAt IS NULL 
   OR createdAt = '0000-00-00 00:00:00' 
   OR YEAR(createdAt) = 0 
   OR MONTH(createdAt) = 0 
   OR DAY(createdAt) = 0;

-- Check for any remaining invalid dates
SELECT id, username, email, createdAt, updatedAt 
FROM user 
WHERE updatedAt IS NULL 
   OR updatedAt = '0000-00-00 00:00:00' 
   OR YEAR(updatedAt) = 0 
   OR MONTH(updatedAt) = 0 
   OR DAY(updatedAt) = 0
LIMIT 10;
