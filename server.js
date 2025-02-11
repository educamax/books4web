const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = process.env.PORT || 3000;

// Função para garantir que os diretórios existam
async function ensureDirectoriesExist() {
    const baseDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'public');
    const dirs = [
        baseDir,
        path.join(baseDir, 'uploads'),
        path.join(baseDir, 'flipbooks')
    ];

    for (const dir of dirs) {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
            console.log('Diretório criado:', dir);
        }
    }
    return baseDir;
}

// Função para sanitizar o nome do flipbook
function sanitizeFlipbookName(name) {
    return name.toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
}

let baseDirectory = '';

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(baseDirectory, 'uploads');
        try {
            await fs.access(uploadDir);
        } catch {
            await fs.mkdir(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'temp-' + Date.now() + '.pdf');
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são permitidos!'));
        }
    },
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB
    }
});

// Inicialização assíncrona
async function initializeApp() {
    try {
        baseDirectory = await ensureDirectoriesExist();
        console.log('Diretório base:', baseDirectory);

        // Servir arquivos estáticos
        app.use(express.static(baseDirectory));
        app.use('/flipbooks', express.static(path.join(baseDirectory, 'flipbooks')));
        app.use(express.json());

        // Rota para verificar se o nome já existe
        app.get('/check-name/:name', async (req, res) => {
            try {
                const name = sanitizeFlipbookName(req.params.name);
                const flipbookDir = path.join(baseDirectory, 'flipbooks', name);
                
                try {
                    await fs.access(flipbookDir);
                    res.json({ exists: true });
                } catch {
                    res.json({ exists: false });
                }
            } catch (error) {
                res.status(500).json({ error: 'Erro ao verificar o nome.' });
            }
        });

        // Rota principal
        app.get('/', (req, res) => {
            res.sendFile(path.join(baseDirectory, 'index.html'));
        });

        // Rota para upload do PDF
        app.post('/upload', upload.single('pdf'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
                }

                if (!req.body.flipbookName) {
                    return res.status(400).json({ error: 'Nome do flipbook não fornecido.' });
                }

                const flipbookName = sanitizeFlipbookName(req.body.flipbookName);
                const flipbookDir = path.join(baseDirectory, 'flipbooks', flipbookName);
                
                try {
                    await fs.access(flipbookDir);
                    return res.status(400).json({ error: 'Este nome já está em uso.' });
                } catch {
                    // Se lançar erro, podemos prosseguir
                }

                // Criar diretório para o flipbook
                await fs.mkdir(flipbookDir, { recursive: true });
                
                const pdfDestination = path.join(flipbookDir, 'document.pdf');
                
                // Mover o PDF para o diretório do flipbook
                await fs.rename(req.file.path, pdfDestination);

                // Criar o arquivo HTML do flipbook
                const htmlPath = path.join(flipbookDir, 'index.html');
                await fs.writeFile(htmlPath, await generateFlipbookHtml());

                const flipbookUrl = `/flipbooks/${flipbookName}`;
                const iframeCode = `<iframe src="${flipbookUrl}/index.html" width="100%" height="600" frameborder="0"></iframe>`;

                res.json({
                    success: true,
                    flipbookUrl: flipbookUrl + '/index.html',
                    iframeCode
                });

            } catch (error) {
                console.error('Erro detalhado:', error);
                if (req.file) {
                    try {
                        await fs.unlink(req.file.path);
                    } catch (unlinkError) {
                        console.error('Erro ao limpar arquivo temporário:', unlinkError);
                    }
                }
                res.status(500).json({ error: 'Erro ao processar o PDF.' });
            }
        });

        // Iniciar o servidor
        app.listen(port, () => {
            console.log(`Servidor rodando em http://localhost:${port}`);
        });

    } catch (error) {
        console.error('Erro na inicialização:', error);
        process.exit(1);
    }
}

// Iniciar o aplicativo
initializeApp();

async function generateFlipbookHtml() {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Flipbook</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/turn.js/3/turn.min.js"></script>
    <style>
        body { 
            margin: 0; 
            background: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        #flipbook-outer-container {
            position: relative;
            width: 95vw;
            height: 90vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #flipbook-container {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
        }
        #flipbook {
            position: relative;
            transform-style: preserve-3d;
            display: none;
        }
        #flipbook .page {
            background: white;
            overflow: hidden;
            background-clip: padding-box;
        }
        #flipbook .page.odd {
            border-right: none;
        }
        #flipbook .page.even {
            border-left: none;
        }
        #flipbook .page canvas {
            width: 100%;
            height: 100%;
            object-fit: contain;
            margin: 0;
            padding: 0;
            display: block;
        }
        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            background: rgba(0,0,0,0.85);
            padding: 30px 50px;
            border-radius: 12px;
            z-index: 1000;
            text-align: center;
            min-width: 200px;
        }
        .loading .spinner {
            width: 40px;
            height: 40px;
            margin: 0 auto 15px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loading .progress {
            margin-top: 10px;
            font-size: 14px;
            color: #ccc;
        }
        .error {
            background: #ff5757;
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            display: none;
        }
        .controls {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.7);
            padding: 10px 20px;
            border-radius: 20px;
            display: flex;
            gap: 10px;
            z-index: 1000;
        }
        .controls button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 5px 10px;
            font-size: 14px;
        }
        .controls button:hover {
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
        }
        .page-info {
            color: white;
            margin: 0 10px;
            line-height: 30px;
        }
        /* Estilos específicos para dispositivos móveis */
        @media (max-width: 768px) {
            #flipbook-outer-container {
                width: 100vw;
                height: 80vh;
                padding: 0;
            }
            #flipbook-container {
                width: 100%;
                height: 100%;
            }
            .controls {
                padding: 8px 15px;
                font-size: 12px;
            }
            .controls button {
                padding: 3px 8px;
                font-size: 12px;
            }
        }
    </style>
</head>
<body>
    <div id="loading" class="loading">
        <div class="spinner"></div>
        <div>Carregando documento...</div>
        <div class="progress">0%</div>
    </div>
    <div id="error" class="error"></div>
    <div id="flipbook-outer-container">
        <div id="flipbook-container">
            <div id="flipbook"></div>
        </div>
    </div>
    <div class="controls">
        <button onclick="previousPage()">❮ Anterior</button>
        <span class="page-info">
            Página <span id="currentPage">0</span> de <span id="totalPages">0</span>
        </span>
        <button onclick="nextPage()">Próxima ❯</button>
    </div>
    <script>
        let pdf = null;
        let flipbookEl = null;
        const loadingEl = document.getElementById('loading');
        const progressEl = loadingEl.querySelector('.progress');
        const errorEl = document.getElementById('error');
        const currentPageEl = document.getElementById('currentPage');
        const totalPagesEl = document.getElementById('totalPages');
        const flipbook = document.getElementById('flipbook');

        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        function previousPage() {
            if (flipbookEl) {
                flipbookEl.turn('previous');
            }
        }

        function nextPage() {
            if (flipbookEl) {
                flipbookEl.turn('next');
            }
        }

        function calculateDimensions(viewport) {
            const outerContainer = document.getElementById('flipbook-outer-container');
            const maxWidth = outerContainer.clientWidth;
            const maxHeight = outerContainer.clientHeight;
            const isMobile = window.innerWidth <= 768;
            
            let width, height, scale;
            
            if (isMobile) {
                // Em dispositivos móveis, usar largura única
                const singlePageWidth = viewport.width;
                const aspectRatio = singlePageWidth / viewport.height;
                
                if (aspectRatio > maxWidth / maxHeight) {
                    width = maxWidth * 0.9;
                    height = width / aspectRatio;
                } else {
                    height = maxHeight * 0.9;
                    width = height * aspectRatio;
                }
                scale = width / viewport.width;
            } else {
                // Em desktop, manter o layout de página dupla
                const doubleWidth = viewport.width * 2;
                const aspectRatio = doubleWidth / viewport.height;
                
                if (aspectRatio > maxWidth / maxHeight) {
                    width = maxWidth * 0.9;
                    height = width / aspectRatio;
                } else {
                    height = maxHeight * 0.9;
                    width = height * aspectRatio;
                }
                scale = (width / 2) / viewport.width;
            }
            
            return {
                width: width,
                height: height,
                scale: scale,
                isMobile: isMobile
            };
        }

        async function renderPage(pageNum, scale) {
            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
                
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.justifyContent = 'center';
                div.style.alignItems = 'center';
                div.appendChild(canvas);
                return div;
            } catch (error) {
                console.error(\`Erro ao renderizar página \${pageNum}:\`, error);
                return null;
            }
        }

        async function renderPDF() {
            try {
                const pdfPath = 'document.pdf';
                console.log('Tentando carregar PDF de:', pdfPath);
                
                const loadingTask = pdfjsLib.getDocument(pdfPath);
                loadingTask.onProgress = function (progress) {
                    const percent = Math.round(progress.loaded / progress.total * 100);
                    progressEl.textContent = \`Carregando PDF... \${percent}%\`;
                };
                
                pdf = await loadingTask.promise;
                console.log('PDF carregado com', pdf.numPages, 'páginas');
                
                const firstPage = await pdf.getPage(1);
                const viewport = firstPage.getViewport({ scale: 1.0 });
                const dimensions = calculateDimensions(viewport);
                
                console.log('Dimensões calculadas:', dimensions);
                
                totalPagesEl.textContent = pdf.numPages;
                
                const flipbookContainer = document.getElementById('flipbook-container');
                flipbookContainer.style.width = dimensions.width + 'px';
                flipbookContainer.style.height = dimensions.height + 'px';
                
                progressEl.textContent = 'Renderizando páginas...';
                
                // Renderiza todas as páginas em paralelo
                const pagePromises = Array.from({ length: pdf.numPages }, (_, i) => {
                    const pageNum = i + 1;
                    return renderPage(pageNum, dimensions.scale).then(pageDiv => {
                        // Atualiza o progresso
                        const progress = Math.round((pageNum / pdf.numPages) * 100);
                        progressEl.textContent = \`Renderizando páginas... \${progress}%\`;
                        return pageDiv;
                    });
                });
                
                const pages = await Promise.all(pagePromises);
                pages.forEach((pageDiv, index) => {
                    if (pageDiv) {
                        flipbook.appendChild(pageDiv);
                    }
                });
                
                flipbookEl = $(flipbook);
                flipbookEl.turn({
                    width: dimensions.width,
                    height: dimensions.height,
                    autoCenter: true,
                    gradients: true,
                    acceleration: true,
                    display: dimensions.isMobile ? 'single' : 'double',
                    elevation: 50,
                    when: {
                        turning: function(event, page) {
                            currentPageEl.textContent = page;
                        },
                        turned: function(event, page) {
                            currentPageEl.textContent = page;
                        }
                    }
                });
                
                // Adiciona suporte a touch
                let touchStartX = 0;
                let touchEndX = 0;

                flipbook.addEventListener('touchstart', function(e) {
                    touchStartX = e.changedTouches[0].screenX;
                }, false);

                flipbook.addEventListener('touchend', function(e) {
                    touchEndX = e.changedTouches[0].screenX;
                    handleSwipe();
                }, false);

                function handleSwipe() {
                    const swipeThreshold = 50; // Quantidade mínima de pixels para considerar um swipe
                    const swipeDistance = touchEndX - touchStartX;

                    if (Math.abs(swipeDistance) > swipeThreshold) {
                        if (swipeDistance > 0) {
                            // Swipe da esquerda para direita - página anterior
                            previousPage();
                        } else {
                            // Swipe da direita para esquerda - próxima página
                            nextPage();
                        }
                    }
                }
                
                currentPageEl.textContent = '1';
                
                function handleResize() {
                    if (flipbookEl) {
                        const newDimensions = calculateDimensions(viewport);
                        const container = document.getElementById('flipbook-container');
                        container.style.width = newDimensions.width + 'px';
                        container.style.height = newDimensions.height + 'px';
                        
                        flipbookEl.turn('size', newDimensions.width, newDimensions.height);
                    }
                }
                
                window.addEventListener('resize', handleResize);
                
                // Mostra o flipbook apenas quando tudo estiver carregado
                flipbook.style.display = 'block';
                loadingEl.style.display = 'none';
                
            } catch (error) {
                console.error('Erro detalhado ao renderizar PDF:', error);
                loadingEl.style.display = 'none';
                errorEl.style.display = 'block';
                errorEl.textContent = 'Erro ao carregar o PDF: ' + error.message;
            }
        }
        
        document.addEventListener('DOMContentLoaded', renderPDF);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                previousPage();
            } else if (e.key === 'ArrowRight') {
                nextPage();
            }
        });
    </script>
</body>
</html>`;
} 