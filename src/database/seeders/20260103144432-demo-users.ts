import { QueryInterface } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

const demoUsers = [
  {
    id: uuidv4(),
    username: 'alice',
    email: 'alice@demo.com',
    password: '$2b$10$demoHashedPassword1234567890alice',
    display_name: 'Alice Silva',
    avatar_url: null,
    status: 'online',
    last_seen_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: uuidv4(),
    username: 'bob',
    email: 'bob@demo.com',
    password: '$2b$10$demoHashedPassword1234567890bobss',
    display_name: 'Bob Santos',
    avatar_url: null,
    status: 'offline',
    last_seen_at: new Date(Date.now() - 3600000),
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: uuidv4(),
    username: 'carol',
    email: 'carol@demo.com',
    password: '$2b$10$demoHashedPassword1234567890carol',
    display_name: 'Carol Oliveira',
    avatar_url: null,
    status: 'away',
    last_seen_at: new Date(Date.now() - 1800000),
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: uuidv4(),
    username: 'david',
    email: 'david@demo.com',
    password: '$2b$10$demoHashedPassword1234567890david',
    display_name: 'David Costa',
    avatar_url: null,
    status: 'busy',
    last_seen_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: uuidv4(),
    username: 'eva',
    email: 'eva@demo.com',
    password: '$2b$10$demoHashedPassword1234567890evass',
    display_name: 'Eva Pereira',
    avatar_url: null,
    status: 'online',
    last_seen_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  },
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('users', demoUsers);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkDelete('users', {
    username: ['alice', 'bob', 'carol', 'david', 'eva'],
  });
}
