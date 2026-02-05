// Workflow Seed Script
// Seeds all 9 freight workflow templates into the database

import { createClient } from '@supabase/supabase-js';
import { ALL_FREIGHT_WORKFLOWS } from '../data/workflow-generator';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function seedWorkflows() {
    console.log('🌱 Seeding 9 freight workflow templates...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const template of ALL_FREIGHT_WORKFLOWS) {
        try {
            console.log(`📝 Seeding: ${template.name}`);

            // Type assertion to access properties
            const templateData: any = template;

            const { data, error } = await supabase
                .from('workflow_definitions')
                .upsert({
                    name: templateData.name,
                    description: templateData.description,
                    category: templateData.category,
                    shipment_types: templateData.serviceTypes || [],
                    customer_tiers: templateData.customerTiers || ['PREMIUM', 'STANDARD', 'BASIC'],
                    nodes: templateData.nodes || [],
                    edges: templateData.edges || [],
                    triggers: templateData.triggers || [],
                    sla_config: templateData.slaConfig || null,
                    tags: templateData.tags || [],
                    status: 'ACTIVE',
                    is_template: true,
                    version: templateData.version || 1
                }, {
                    onConflict: 'name,version'
                });

            if (error) {
                console.error(`   ❌ Error: ${error.message}\n`);
                errorCount++;
            } else {
                console.log(`   ✅ Success\n`);
                successCount++;
            }
        } catch (err) {
            console.error(`   ❌ Exception: ${err}\n`);
            errorCount++;
        }
    }

    console.log('━'.repeat(50));
    console.log(`\n📊 Seeding Results:`);
    console.log(`   ✅ Success: ${successCount}/9`);
    console.log(`   ❌ Errors:  ${errorCount}/9\n`);

    if (successCount === 9) {
        console.log('🎉 All workflow templates seeded successfully!');
    } else if (successCount > 0) {
        console.log('⚠️  Some workflows were seeded, but errors occurred');
    } else {
        console.log('💥 Seeding failed completely. Check your database connection and credentials.');
    }

    process.exit(errorCount > 0 ? 1 : 0);
}

// Run the seeder
seedWorkflows().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
