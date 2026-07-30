import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

try {
  const tables = await sql`
    SELECT table_name 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY table_name
  `;
  
  console.log('✅ Connected to Supabase!\n');
  console.log(`📊 Found ${tables.length} tables:\n`);
  tables.forEach(t => console.log(`   - ${t.table_name}`));
  
  if (tables.length >= 14) {
    console.log('\n✅ All required tables created successfully!');
  } else {
    console.log('\n❌ Missing tables. Re-run schema.sql');
  }
  
  process.exit(0);
} catch (error) {
  console.error('❌ Connection failed:', error.message);
  process.exit(1);
} finally {
  await sql.end();
}
