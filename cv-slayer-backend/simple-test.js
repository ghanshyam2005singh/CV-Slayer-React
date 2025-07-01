require('dotenv').config();

console.log('🔧 Runtime Environment Check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('JWT_SECRET:', process.env.JWT_SECRET);
console.log('ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD);
console.log('ADMIN_EMAILS:', process.env.ADMIN_EMAILS);
console.log('\n🔧 Raw process.env.JWT_SECRET:');
console.log('Type:', typeof process.env.JWT_SECRET);
console.log('Length:', process.env.JWT_SECRET?.length);
console.log('First 20 chars:', process.env.JWT_SECRET?.substring(0, 20));
console.log('Last 20 chars:', process.env.JWT_SECRET?.substring(-20));

// Check if there are any invisible characters
if (process.env.JWT_SECRET) {
  console.log('\n🔧 Character analysis:');
  for (let i = 0; i < Math.min(20, process.env.JWT_SECRET.length); i++) {
    const char = process.env.JWT_SECRET[i];
    console.log(`Char ${i}: "${char}" (code: ${char.charCodeAt(0)})`);
  }
}