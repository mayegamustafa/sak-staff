import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('job_titles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('title', 200).notNullable();
    t.string('job_group', 50).nullable();           // e.g. U4, P2, T3
    t.enu('category', [
      'teaching', 'administrative', 'support', 'management', 'other'
    ]).defaultTo('other');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // Seed common SAK school roles
  await knex('job_titles').insert([
    { title: 'Head Teacher',            job_group: 'U2',  category: 'management'     },
    { title: 'Deputy Head Teacher',     job_group: 'U3',  category: 'management'     },
    { title: 'Director of Studies',     job_group: 'U3',  category: 'management'     },
    { title: 'Head of Department',      job_group: 'U4',  category: 'management'     },
    { title: 'Senior Teacher',          job_group: 'U4',  category: 'teaching'       },
    { title: 'Teacher',                 job_group: 'U5',  category: 'teaching'       },
    { title: 'Assistant Teacher',       job_group: 'U6',  category: 'teaching'       },
    { title: 'ICT Teacher',             job_group: 'U5',  category: 'teaching'       },
    { title: 'Bursar',                  job_group: 'U4',  category: 'administrative' },
    { title: 'Accounts Assistant',      job_group: 'U6',  category: 'administrative' },
    { title: 'School Secretary',        job_group: 'U6',  category: 'administrative' },
    { title: 'Store Keeper',            job_group: 'U7',  category: 'support'        },
    { title: 'Librarian',               job_group: 'U5',  category: 'support'        },
    { title: 'Lab Technician',          job_group: 'U6',  category: 'support'        },
    { title: 'School Nurse',            job_group: 'U5',  category: 'support'        },
    { title: 'Matron / Patron',         job_group: 'U6',  category: 'support'        },
    { title: 'Security Guard',          job_group: 'U8',  category: 'support'        },
    { title: 'Driver',                  job_group: 'U8',  category: 'support'        },
    { title: 'Cleaner / Janitor',       job_group: 'U8',  category: 'support'        },
    { title: 'Cook',                    job_group: 'U8',  category: 'support'        },
    { title: 'IT Support Officer',      job_group: 'U6',  category: 'administrative' },
    { title: 'Counsellor',              job_group: 'U5',  category: 'support'        },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('job_titles');
}
