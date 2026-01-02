<div align="center">

# 💬 Real-Time Messaging Platform

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](LICENSE)
[![Coverage](https://img.shields.io/badge/Coverage-100%25-brightgreen?style=flat-square)](coverage/)

🇺🇸 English • [🇧🇷 Português](#-português)

</div>

---

# 🇺🇸 English

> Modern real-time messaging platform built with polyglot persistence and scalable architecture.

## 📖 About the Project

Real-Time Messaging Platform is a robust backend application designed for high-performance real-time communication. The project implements modern architectural patterns including Clean Architecture, Event-Driven Design, and Domain-Driven Design (DDD).

### ✨ Key Features

- 🔐 **JWT Authentication** - Secure authentication system with token refresh
- 💬 **Real-Time Messaging** - WebSocket-based instant messaging with Socket.IO
- 👥 **User Management** - Complete CRUD with profile customization
- 🔔 **Push Notifications** - Real-time notification system
- 🔍 **Full-Text Search** - Elasticsearch-powered message search
- 📊 **Online Presence** - Real-time user status tracking
- ⚡ **High Performance** - Redis caching and optimized queries
- 🧪 **100% Test Coverage** - Comprehensive unit and integration tests
- 🐳 **Docker Ready** - Containerized development and production environment

---

## 🚀 Technologies

### Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 22.x | JavaScript runtime with native ES modules |
| **TypeScript** | 5.9 | Static typing and enhanced DX |
| **Express** | 5.x | Fast, minimalist web framework |
| **Socket.IO** | 4.x | Real-time bidirectional communication |
| **Sequelize** | 6.x | Feature-rich ORM for PostgreSQL |
| **Zod** | 4.x | TypeScript-first schema validation |

### Data Layer

| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary relational database (users, configs) |
| **MongoDB** | Message history and flexible documents |
| **Redis** | Session cache, presence, pub/sub |
| **Elasticsearch** | Full-text search engine |

### Development Tools

| Tool | Purpose |
|------|---------|
| **Jest** | Testing framework with coverage |
| **ESLint** | Code linting and standards |
| **Prettier** | Code formatting |
| **Docker Compose** | Container orchestration |
| **PM2** | Process management in production |

### Architecture Patterns

- 📐 **Clean Architecture** - Separation of concerns
- 📡 **Event-Driven** - Async communication via EventBus
- 🧱 **Repository Pattern** - Data access abstraction
- 🎯 **Service Layer** - Business logic isolation
- 🔄 **Singleton Pattern** - Shared resource management

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** & **Docker Compose** (recommended)
- **Node.js 22+** (for local development)
- **Git**

---

## ⚡ Quick Start

### 🐳 With Docker (Recommended)

\`\`\`bash
# Clone the repository
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform

# Start all services
docker compose up -d

# Run database migrations
docker exec rtm-app npm run db:migrate

# Run database seeders (optional)
docker exec rtm-app npm run db:seed

# Access the application
curl http://localhost:3000/health
\`\`\`

### 💻 Local Development

\`\`\`bash
# Clone the repository
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start in development mode
npm run dev
\`\`\`

---

## 📁 Project Structure

\`\`\`
real-time-messaging-platform/
├── src/
│   ├── modules/                # Feature modules (Bounded Contexts)
│   │   ├── auth/               # Authentication & authorization
│   │   ├── user/               # User management
│   │   ├── chat/               # Messaging system
│   │   ├── notification/       # Push notifications
│   │   └── search/             # Search engine integration
│   │
│   ├── shared/                 # Shared infrastructure
│   │   ├── config/             # Centralized configuration
│   │   ├── constants/          # Constants and enums
│   │   ├── database/           # Database connections & migrations
│   │   ├── errors/             # Error hierarchy (AppError, ValidationError)
│   │   ├── event-bus/          # Event-driven communication
│   │   ├── interfaces/         # TypeScript contracts
│   │   ├── logger/             # Structured logging system
│   │   ├── middlewares/        # Express middleware pipeline
│   │   ├── types/              # Shared TypeScript types
│   │   ├── utils/              # 50+ utility functions
│   │   └── validation/         # Zod schemas
│   │
│   ├── app.ts                  # Express application setup
│   ├── bootstrap.ts            # Service initialization
│   └── server.ts               # Entry point
│
├── tests/
│   ├── unit/                   # Unit tests
│   └── feature/                # Integration tests
│
├── docs/
│   └── ARCHITECTURE.md         # Architectural documentation
│
├── docker-compose.yml          # Container orchestration
├── Dockerfile                  # Application container
└── package.json                # Dependencies and scripts
\`\`\`

---

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start development server with hot reload |
| \`npm run build\` | Compile TypeScript to JavaScript |
| \`npm run start\` | Start production server |
| \`npm run test\` | Run tests with coverage report |
| \`npm run lint\` | Run ESLint and fix issues |
| \`npm run format\` | Format code with Prettier |
| \`npm run db:migrate\` | Run database migrations |
| \`npm run db:seed\` | Seed database with sample data |

---

## 🏗️ Architecture

The application follows **Clean Architecture** principles with clear separation of concerns.

### Layer Overview

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                        Controllers                           │
│         (HTTP handling, request validation)                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Services                             │
│            (Business logic, orchestration)                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Repositories                           │
│              (Data access abstraction)                      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Data Sources                          │
│           (PostgreSQL, MongoDB, Redis, Elastic)             │
└─────────────────────────────────────────────────────────────┘
\`\`\`

📚 For detailed architectural documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🧪 Testing

The project maintains **100% test coverage** across all metrics.

\`\`\`bash
# Run all tests with coverage
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- path/to/test.ts
\`\`\`

### Coverage Report

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Branches | 100% |
| Functions | 100% |
| Lines | 100% |

---

## 📊 Performance

- ⚡ **Redis Cache** - Sub-millisecond response times
- 🔄 **Connection Pooling** - Optimized database connections
- 📦 **Rate Limiting** - Redis-backed request throttling
- 🚀 **Lazy Loading** - On-demand resource loading
- 📈 **Horizontal Scaling** - Stateless design for easy scaling

---

## 🔒 Security

- 🔐 **Helmet.js** - Secure HTTP headers
- 🛡️ **CORS** - Configured cross-origin policies
- ⏱️ **Rate Limiting** - DDoS and brute-force protection
- ✅ **Input Validation** - Zod schema validation on all endpoints
- 🔑 **Password Hashing** - bcrypt with configurable rounds
- 📝 **Audit Logging** - Security event tracking

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'feat: add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

- \`feat:\` New features
- \`fix:\` Bug fixes
- \`docs:\` Documentation changes
- \`test:\` Test additions/changes
- \`refactor:\` Code refactoring
- \`chore:\` Maintenance tasks

---

## �� License

This project is licensed under the **ISC License** - see the [LICENSE](LICENSE) file for details.

---

<br>

# 🇧🇷 Português

> Plataforma moderna de mensagens em tempo real construída com persistência poliglota e arquitetura escalável.

## 📖 Sobre o Projeto

Real-Time Messaging Platform é uma aplicação backend robusta projetada para comunicação em tempo real de alta performance. O projeto implementa padrões arquiteturais modernos incluindo Clean Architecture, Event-Driven Design e Domain-Driven Design (DDD).

### ✨ Principais Funcionalidades

- 🔐 **Autenticação JWT** - Sistema seguro de autenticação com refresh de tokens
- 💬 **Mensagens em Tempo Real** - Mensagens instantâneas via WebSocket com Socket.IO
- 👥 **Gestão de Usuários** - CRUD completo com personalização de perfil
- 🔔 **Notificações Push** - Sistema de notificações em tempo real
- 🔍 **Busca Full-Text** - Busca de mensagens com Elasticsearch
- 📊 **Presença Online** - Rastreamento de status de usuários em tempo real
- ⚡ **Alta Performance** - Cache Redis e queries otimizadas
- 🧪 **100% de Cobertura de Testes** - Testes unitários e de integração abrangentes
- 🐳 **Docker Ready** - Ambiente containerizado para desenvolvimento e produção

---

## 🚀 Tecnologias

### Stack Backend

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Node.js** | 22.x | Runtime JavaScript com módulos ES nativos |
| **TypeScript** | 5.9 | Tipagem estática e DX aprimorada |
| **Express** | 5.x | Framework web rápido e minimalista |
| **Socket.IO** | 4.x | Comunicação bidirecional em tempo real |
| **Sequelize** | 6.x | ORM completo para PostgreSQL |
| **Zod** | 4.x | Validação de schemas TypeScript-first |

### Camada de Dados

| Tecnologia | Propósito |
|------------|-----------|
| **PostgreSQL** | Banco relacional principal (usuários, configs) |
| **MongoDB** | Histórico de mensagens e documentos flexíveis |
| **Redis** | Cache de sessão, presença, pub/sub |
| **Elasticsearch** | Motor de busca full-text |

### Ferramentas de Desenvolvimento

| Ferramenta | Propósito |
|------------|-----------|
| **Jest** | Framework de testes com cobertura |
| **ESLint** | Linting e padrões de código |
| **Prettier** | Formatação de código |
| **Docker Compose** | Orquestração de containers |
| **PM2** | Gerenciamento de processos em produção |

### Padrões de Arquitetura

- 📐 **Clean Architecture** - Separação de responsabilidades
- 📡 **Event-Driven** - Comunicação assíncrona via EventBus
- 🧱 **Repository Pattern** - Abstração de acesso a dados
- 🎯 **Service Layer** - Isolamento de lógica de negócio
- 🔄 **Singleton Pattern** - Gerenciamento de recursos compartilhados

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Docker** & **Docker Compose** (recomendado)
- **Node.js 22+** (para desenvolvimento local)
- **Git**

---

## ⚡ Início Rápido

### 🐳 Com Docker (Recomendado)

\`\`\`bash
# Clone o repositório
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform

# Inicie todos os serviços
docker compose up -d

# Execute as migrations do banco
docker exec rtm-app npm run db:migrate

# Execute os seeders (opcional)
docker exec rtm-app npm run db:seed

# Acesse a aplicação
curl http://localhost:3000/health
\`\`\`

### 💻 Desenvolvimento Local

\`\`\`bash
# Clone o repositório
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform

# Instale as dependências
npm install

# Configure o ambiente
cp .env.example .env

# Inicie em modo de desenvolvimento
npm run dev
\`\`\`

---

## 📁 Estrutura do Projeto

\`\`\`
real-time-messaging-platform/
├── src/
│   ├── modules/                # Módulos de features (Bounded Contexts)
│   │   ├── auth/               # Autenticação e autorização
│   │   ├── user/               # Gestão de usuários
│   │   ├── chat/               # Sistema de mensagens
│   │   ├── notification/       # Notificações push
│   │   └── search/             # Integração com motor de busca
│   │
│   ├── shared/                 # Infraestrutura compartilhada
│   │   ├── config/             # Configuração centralizada
│   │   ├── constants/          # Constantes e enums
│   │   ├── database/           # Conexões e migrations
│   │   ├── errors/             # Hierarquia de erros (AppError, ValidationError)
│   │   ├── event-bus/          # Comunicação event-driven
│   │   ├── interfaces/         # Contratos TypeScript
│   │   ├── logger/             # Sistema de logging estruturado
│   │   ├── middlewares/        # Pipeline de middlewares Express
│   │   ├── types/              # Tipos TypeScript compartilhados
│   │   ├── utils/              # 50+ funções utilitárias
│   │   └── validation/         # Schemas Zod
│   │
│   ├── app.ts                  # Configuração da aplicação Express
│   ├── bootstrap.ts            # Inicialização de serviços
│   └── server.ts               # Ponto de entrada
│
├── tests/
│   ├── unit/                   # Testes unitários
│   └── feature/                # Testes de integração
│
├── docs/
│   └── ARCHITECTURE.md         # Documentação arquitetural
│
├── docker-compose.yml          # Orquestração de containers
├── Dockerfile                  # Container da aplicação
└── package.json                # Dependências e scripts
\`\`\`

---

## 🛠️ Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| \`npm run dev\` | Iniciar servidor de desenvolvimento com hot reload |
| \`npm run build\` | Compilar TypeScript para JavaScript |
| \`npm run start\` | Iniciar servidor de produção |
| \`npm run test\` | Executar testes com relatório de cobertura |
| \`npm run lint\` | Executar ESLint e corrigir problemas |
| \`npm run format\` | Formatar código com Prettier |
| \`npm run db:migrate\` | Executar migrations do banco |
| \`npm run db:seed\` | Popular banco com dados de exemplo |

---

## 🏗️ Arquitetura

A aplicação segue princípios de **Clean Architecture** com clara separação de responsabilidades.

### Visão das Camadas

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                        Controllers                           │
│         (Manipulação HTTP, validação de requests)           │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Services                             │
│            (Lógica de negócio, orquestração)                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Repositories                           │
│              (Abstração de acesso a dados)                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Data Sources                          │
│           (PostgreSQL, MongoDB, Redis, Elastic)             │
└─────────────────────────────────────────────────────────────┘
\`\`\`

📚 Para documentação arquitetural detalhada, veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🧪 Testes

O projeto mantém **100% de cobertura de testes** em todas as métricas.

\`\`\`bash
# Executar todos os testes com cobertura
npm run test

# Executar testes em modo watch
npm run test:watch

# Executar arquivo de teste específico
npm run test -- path/to/test.ts
\`\`\`

### Relatório de Cobertura

| Métrica | Cobertura |
|---------|-----------|
| Statements | 100% |
| Branches | 100% |
| Functions | 100% |
| Lines | 100% |

---

## 📊 Performance

- ⚡ **Cache Redis** - Tempos de resposta sub-millisegundos
- 🔄 **Connection Pooling** - Conexões de banco otimizadas
- 📦 **Rate Limiting** - Throttling de requests com Redis
- 🚀 **Lazy Loading** - Carregamento de recursos sob demanda
- 📈 **Escalabilidade Horizontal** - Design stateless para fácil escalonamento

---

## 🔒 Segurança

- 🔐 **Helmet.js** - Headers HTTP seguros
- 🛡️ **CORS** - Políticas cross-origin configuradas
- ⏱️ **Rate Limiting** - Proteção contra DDoS e força bruta
- ✅ **Validação de Input** - Validação Zod em todos os endpoints
- 🔑 **Hash de Senhas** - bcrypt com rounds configuráveis
- �� **Audit Logging** - Rastreamento de eventos de segurança

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor, siga estas diretrizes:

1. Faça um fork do repositório
2. Crie uma branch de feature (\`git checkout -b feature/feature-incrivel\`)
3. Commit suas alterações (\`git commit -m 'feat: adiciona feature incrível'\`)
4. Push para a branch (\`git push origin feature/feature-incrivel\`)
5. Abra um Pull Request

### Convenção de Commits

Este projeto segue [Conventional Commits](https://www.conventionalcommits.org/):

- \`feat:\` Novas features
- \`fix:\` Correções de bugs
- \`docs:\` Alterações de documentação
- \`test:\` Adições/alterações de testes
- \`refactor:\` Refatoração de código
- \`chore:\` Tarefas de manutenção

---

## 📄 Licença

Este projeto está licenciado sob a **Licença ISC** - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

<div align="center">

**Desenvolvido com ❤️ por [Gabriel Silva](https://github.com/GabeSilvaDev)**

</div>
