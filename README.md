# Books4Web - Conversor de PDF para Flipbook

Uma ferramenta web para converter arquivos PDF em Flipbooks interativos online, com suporte a navegação por touch e URLs personalizadas.

## Características

- Upload de arquivos PDF (até 20MB)
- URLs personalizadas para cada flipbook
- Interface responsiva e moderna
- Suporte a touch para dispositivos móveis
- Navegação por teclado (setas)
- Geração de código para incorporação
- Sem necessidade de banco de dados

## Requisitos do Sistema

- Node.js (versão 14 ou superior)
- NPM (Node Package Manager)

## Instalação

1. Clone ou baixe este repositório
2. Navegue até a pasta do projeto
3. Instale as dependências:

```bash
npm install
```

4. Crie as pastas necessárias:

```bash
mkdir -p public/uploads public/flipbooks
```

5. Inicie o servidor:

```bash
npm start
```

O aplicativo estará disponível em `http://localhost:3000`

## Implantação em Produção

### Preparação

1. Certifique-se de que todas as dependências estão instaladas:
```bash
npm install --production
```

2. Configure as permissões das pastas:
```bash
chmod 755 public/uploads public/flipbooks
```

### Hospedagem Compartilhada (cPanel)

1. Faça upload de todos os arquivos para sua hospedagem
2. Configure o Node.js no cPanel (se disponível)
3. Configure o domínio/subdomínio para apontar para a pasta do projeto
4. Inicie o aplicativo usando o gerenciador de processos do cPanel

### VPS/Servidor Dedicado

1. Instale o Node.js e o npm
2. Configure um proxy reverso (Nginx/Apache) apontando para a porta do aplicativo
3. Use o PM2 para gerenciar o processo:

```bash
# Instale o PM2 globalmente
npm install -g pm2

# Inicie o aplicativo
pm2 start server.js --name books4web

# Configure o PM2 para iniciar com o sistema
pm2 startup
pm2 save
```

### Exemplo de Configuração Nginx

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Configuração para arquivos estáticos
    location /flipbooks {
        alias /caminho/para/public/flipbooks;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

## Estrutura de Diretórios

```
/
├── public/
│   ├── uploads/     # Arquivos PDF temporários
│   ├── flipbooks/   # Flipbooks gerados
│   └── index.html   # Interface do usuário
├── server.js        # Servidor Node.js
├── package.json     # Dependências
└── README.md        # Este arquivo
```

## Manutenção

### Limpeza de Arquivos Temporários

Os arquivos temporários são automaticamente limpos em caso de erro, mas você pode criar um cron job para limpar arquivos antigos:

```bash
# Exemplo de cron job para limpar arquivos temporários com mais de 24 horas
0 0 * * * find /caminho/para/public/uploads -type f -name "temp-*" -mtime +1 -exec rm {} \;
```

## Limitações

- Tamanho máximo do arquivo: 20MB
- Formato suportado: PDF
- Os arquivos PDF são mantidos no servidor
- Necessário espaço em disco suficiente para armazenar os PDFs e flipbooks

## Suporte a Navegadores

- Chrome (recomendado)
- Firefox
- Safari
- Edge
- Chrome Mobile
- Safari Mobile

## Tecnologias Utilizadas

- Node.js + Express
- pdf2pic para conversão de PDF
- Turn.js para navegação interativa
- Tailwind CSS para estilização 