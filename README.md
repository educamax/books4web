# Books4Web - Conversor de PDF para Flipbook

Uma ferramenta web para converter arquivos PDF em Flipbooks interativos online, com suporte a navegação por touch, URLs personalizadas e armazenamento em nuvem.

## Características

- Upload de arquivos PDF (até 20MB)
- Autenticação por chave de acesso
- URLs personalizadas para cada flipbook
- Interface responsiva e moderna
- Suporte a touch para dispositivos móveis
- Navegação por teclado (setas)
- Geração de código para incorporação
- Armazenamento em nuvem via Supabase
- Listagem de flipbooks com ações rápidas
- Feedback visual para ações do usuário

## Requisitos do Sistema

- Node.js (versão 14 ou superior)
- NPM (Node Package Manager)
- Conta no Supabase para armazenamento

## Instalação

1. Clone ou baixe este repositório
2. Navegue até a pasta do projeto
3. Instale as dependências:

```bash
npm install
```

4. Configure as variáveis de ambiente:
   - Crie um arquivo `.env` na raiz do projeto
   - Adicione as seguintes variáveis:
```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
ACCESS_KEY=sua_chave_de_acesso
NODE_ENV=development
PORT=3000
```

5. Inicie o servidor:

```bash
npm start
```

O aplicativo estará disponível em `http://localhost:3000`

## Implantação em Produção

### Vercel (Recomendado)

1. Faça fork do repositório no GitHub
2. Conecte o repositório ao Vercel
3. Configure as variáveis de ambiente no Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ACCESS_KEY`
   - `NODE_ENV=production`

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
}
```

## Estrutura de Diretórios

```
/
├── server.js        # Servidor Node.js
├── supabase.js      # Configuração do Supabase
├── index.html       # Interface do usuário
├── package.json     # Dependências
├── vercel.json      # Configuração do Vercel
├── .env            # Variáveis de ambiente (não versionado)
└── README.md        # Este arquivo
```

## Funcionalidades

### Upload de PDF
- Suporte a drag-and-drop
- Validação de tipo de arquivo
- Limite de tamanho (20MB)
- Feedback visual do progresso

### Autenticação
- Proteção por chave de acesso
- Configurável via variável de ambiente
- Necessária para upload de PDFs

### Visualização
- Interface responsiva
- Modo de página única em dispositivos móveis
- Modo de página dupla em desktop
- Controles de navegação intuitivos
- Suporte a gestos touch

### Gerenciamento
- Listagem de todos os flipbooks
- Botões de ação rápida
- Cópia de código de incorporação
- Exclusão de flipbooks
- Feedback visual para ações

## Suporte a Navegadores

- Chrome (recomendado)
- Firefox
- Safari
- Edge
- Chrome Mobile
- Safari Mobile

## Tecnologias Utilizadas

- Node.js + Express
- Supabase para armazenamento
- PDF.js para renderização
- Turn.js para navegação interativa
- Tailwind CSS para estilização
- Vercel para hospedagem

## Segurança

- Validação de tipos de arquivo
- Proteção por chave de acesso
- Armazenamento seguro em nuvem
- Sanitização de nomes de arquivo
- Limitação de tamanho de upload

## Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo LICENSE para detalhes. 