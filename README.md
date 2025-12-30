# 💬 Real-Time Messaging Platform

A real-time messaging platform built with modern technologies demonstrating scalable architecture and polyglot persistence.

## 🚀 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js 22** | Runtime |
| **TypeScript** | Type safety |
| **Express 5** | HTTP Server |
| **Socket.IO** | Real-time communication |
| **Sequelize** | ORM (PostgreSQL) |
| **PostgreSQL** | Primary database |
| **Redis** | Cache & presence |
| **MongoDB** | Message history |
| **Elasticsearch** | Full-text search |

## ⚡ Quick Start

```bash
# Clone repository
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform

# Start services with Docker
docker compose up -d

# Run migrations
docker exec rtm-app npm run db:migrate

# Access application
http://localhost:3000
```

## 📁 Project Structure

```
src/
├── modules/           # Feature modules
│   ├── auth/          # Authentication
│   ├── user/          # User management
│   ├── chat/          # Messaging
│   ├── notification/  # Notifications
│   └── search/        # Search engine
├── shared/            # Shared resources
│   ├── database/      # DB connections
│   ├── middlewares/   # Express middlewares
│   └── utils/         # Utilities
├── app.ts             # Express app
├── server.ts          # Entry point
└── bootstrap.ts       # Initialization
```

## 🛠️ Available Scripts

```bash
npm run dev          # Development mode
npm run build        # Build TypeScript
npm run start        # Production mode
npm run lint         # Run ESLint
npm run format       # Run Prettier
npm run db:migrate   # Run migrations
```

## 📄 License

ISC

---

# 💬 Plataforma de Mensagens em Tempo Real

Uma plataforma de mensagens em tempo real construída com tecnologias modernas, demonstrando arquitetura escalável e persistência poliglota.

## 🚀 Stack Tecnológica

| Tecnologia | Propósito |
|------------|-----------|
| **Node.js 22** | Runtime |
| **TypeScript** | Tipagem segura |
| **Express 5** | Servidor HTTP |
| **Socket.IO** | Comunicação em tempo real |
| **Sequelize** | ORM (PostgreSQL) |
| **PostgreSQL** | Banco de dados principal |
| **Redis** | Cache e presença |
| **MongoDB** | Histórico de mensagens |
| **Elasticsearch** | Busca full-text |

## ⚡ Início Rápido

```bash
# Clonar repositório
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform

# Iniciar serviços com Docker
docker compose up -d

# Executar migrations
docker exec rtm-app npm run db:migrate

# Acessar aplicação
http://localhost:3000
```

## 📁 Estrutura do Projeto

```
src/
├── modules/           # Módulos de funcionalidades
│   ├── auth/          # Autenticação
│   ├── user/          # Gestão de usuários
│   ├── chat/          # Mensagens
│   ├── notification/  # Notificações
│   └── search/        # Motor de busca
├── shared/            # Recursos compartilhados
│   ├── database/      # Conexões de banco
│   ├── middlewares/   # Middlewares Express
│   └── utils/         # Utilitários
├── app.ts             # App Express
├── server.ts          # Ponto de entrada
└── bootstrap.ts       # Inicialização
```

## 🛠️ Scripts Disponíveis

```bash
npm run dev          # Modo desenvolvimento
npm run build        # Build TypeScript
npm run start        # Modo produção
npm run lint         # Executar ESLint
npm run format       # Executar Prettier
npm run db:migrate   # Executar migrations
```

## 📄 Licença

ISC
