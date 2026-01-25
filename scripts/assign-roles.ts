import { supabaseAdmin } from '../src/config/database.config';

async function assignRoles() {
  console.log('🔄 Assigning roles to test users...\n');

  try {
    // Get admin user from auth
    const { data: adminAuthUser, error: adminAuthError } = await supabaseAdmin.auth.admin.listUsers();
    const adminUser = adminAuthUser?.users.find(u => u.email === 'admin@banxway.com');
    
    if (adminUser) {
      // Insert/Update admin in public.users
      const { error } = await supabaseAdmin
        .from('users')
        .upsert({
          id: adminUser.id,
          email: 'admin@banxway.com',
          full_name: 'Admin User',
          role: 'admin',
          is_active: true,
        });
      
      if (error) {
        console.error('❌ Error updating admin user:', error);
      } else {
        console.log('✅ Admin user updated with role: admin');
      }
    }

    // Get demo user from auth
    const demoUser = adminAuthUser?.users.find(u => u.email === 'demo@banxway.com');
    
    if (demoUser) {
      // Insert/Update demo in public.users
      const { error } = await supabaseAdmin
        .from('users')
        .upsert({
          id: demoUser.id,
          email: 'demo@banxway.com',
          full_name: 'Demo User',
          role: 'viewer',
          is_active: true,
        });
      
      if (error) {
        console.error('❌ Error updating demo user:', error);
      } else {
        console.log('✅ Demo user updated with role: viewer');
      }
    }

    // Verify roles
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('email, full_name, role, is_active')
      .in('email', ['admin@banxway.com', 'demo@banxway.com']);

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
    } else {
      console.log('\n📋 Current users:');
      console.table(users);
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

assignRoles();
