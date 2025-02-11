require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { supabase } = require('./supabase');

const app = express();
const port = process.env.PORT || 3000;

// Função para garantir que os diretórios existam
async function ensureDirectoriesExist() {
    // No Vercel, não precisamos criar diretórios físicos
    if (process.env.VERCEL) {
        return '/tmp';
    }

    const baseDir = path.join(__dirname, 'public');
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

// Configuração do Multer para armazenar em memória
const upload = multer({
    storage: multer.memoryStorage(),
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
        // No Vercel, não precisamos esperar pela criação de diretórios
        baseDirectory = process.env.VERCEL ? '/tmp' : await ensureDirectoriesExist();
        console.log('Diretório base:', baseDirectory);
        console.log('Ambiente:', process.env.NODE_ENV);
        console.log('Supabase URL:', process.env.SUPABASE_URL);

        // Verificar se o bucket existe
        console.log('Verificando buckets do Supabase...');
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
            console.error('Erro ao listar buckets:', bucketsError);
            throw bucketsError;
        }

        console.log('Buckets encontrados:', buckets.map(b => b.name));
        
        const flipbooksBucket = buckets.find(b => b.name === 'flipbooks');
        
        if (!flipbooksBucket) {
            console.log('Tentando criar o bucket flipbooks...');
            const { error: createError } = await supabase.storage.createBucket('flipbooks', {
                public: true,
                fileSizeLimit: 20971520 // 20MB em bytes
            });
            
            if (createError) {
                console.error('Erro ao criar bucket:', createError);
                throw createError;
            }
            
            console.log('Bucket flipbooks criado com sucesso');
        } else {
            console.log('Bucket flipbooks encontrado:', flipbooksBucket);
        }

        // Servir arquivos estáticos
        app.use('/flipbooks', express.static(path.join(baseDirectory, 'flipbooks')));
        app.use(express.json());

        // Rota para listar todos os flipbooks
        app.get('/list-flipbooks', async (req, res) => {
            try {
                console.log('Listando flipbooks do Supabase...');
                const { data: folders } = await supabase.storage
                    .from('flipbooks')
                    .list('', {
                        limit: 100,
                        offset: 0,
                        sortBy: { column: 'name', order: 'asc' }
                    });

                const flipbooks = folders
                    .filter(item => item.metadata && item.metadata.mimetype === 'text/html')
                    .map(item => {
                        const name = item.name.replace('/index.html', '');
                        const { data: { publicUrl } } = supabase.storage
                            .from('flipbooks')
                            .getPublicUrl(`${name}/index.html`);
                        
                        return {
                            name,
                            url: publicUrl
                        };
                    });

                res.json(flipbooks);
            } catch (error) {
                console.error('Erro ao listar flipbooks:', error);
                res.status(500).json({ error: 'Erro ao listar flipbooks', details: error.message });
            }
        });

        // Rota para verificar se o nome já existe
        app.get('/check-name/:name', async (req, res) => {
            try {
                const name = sanitizeFlipbookName(req.params.name);
                const { data } = await supabase.storage
                    .from('flipbooks')
                    .list(`${name}/`);

                res.json({ exists: data && data.length > 0 });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao verificar o nome.' });
            }
        });

        // Rota para excluir um flipbook
        app.delete('/flipbook/:name', async (req, res) => {
            try {
                const name = sanitizeFlipbookName(req.params.name);
                
                // Lista todos os arquivos na pasta
                const { data: files } = await supabase.storage
                    .from('flipbooks')
                    .list(`${name}/`);

                // Exclui cada arquivo
                for (const file of files) {
                    const { error } = await supabase.storage
                        .from('flipbooks')
                        .remove([`${name}/${file.name}`]);
                    
                    if (error) throw error;
                }

                res.json({ success: true });
            } catch (error) {
                console.error('Erro ao excluir flipbook:', error);
                res.status(500).json({ error: 'Erro ao excluir flipbook' });
            }
        });

        // Rota principal
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
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

                // Upload do PDF para o Supabase
                const { error: pdfError } = await supabase.storage
                    .from('flipbooks')
                    .upload(`${flipbookName}/document.pdf`, req.file.buffer, {
                        contentType: 'application/pdf',
                        cacheControl: '3600',
                        upsert: true
                    });

                if (pdfError) throw pdfError;

                // Obter URLs públicas
                const { data: { publicUrl: pdfUrl } } = supabase.storage
                    .from('flipbooks')
                    .getPublicUrl(`${flipbookName}/document.pdf`);

                console.log('URL do PDF:', pdfUrl); // Log para debug

                // Gerar e fazer upload do CSS
                const cssContent = `
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
                `;

                const { error: cssError } = await supabase.storage
                    .from('flipbooks')
                    .upload(`${flipbookName}/styles.css`, Buffer.from(cssContent), {
                        contentType: 'text/css',
                        cacheControl: '3600',
                        upsert: true
                    });

                if (cssError) throw cssError;

                const { data: { publicUrl: cssUrl } } = supabase.storage
                    .from('flipbooks')
                    .getPublicUrl(`${flipbookName}/styles.css`);

                // Gerar e fazer upload do JavaScript
                const jsContent = `
                    let pdf = null;
                    let flipbookEl = null;
                    const loadingEl = document.getElementById('loading');
                    const progressEl = loadingEl.querySelector('.progress');
                    const errorEl = document.getElementById('error');
                    const currentPageEl = document.getElementById('currentPage');
                    const totalPagesEl = document.getElementById('totalPages');
                    const flipbook = document.getElementById('flipbook');
                    const prevBtn = document.getElementById('prevBtn');
                    const nextBtn = document.getElementById('nextBtn');

                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    
                    prevBtn.addEventListener('click', () => {
                        if (flipbookEl) {
                            flipbookEl.turn('previous');
                        }
                    });

                    nextBtn.addEventListener('click', () => {
                        if (flipbookEl) {
                            flipbookEl.turn('next');
                        }
                    });

                    function calculateDimensions(viewport) {
                        const outerContainer = document.getElementById('flipbook-outer-container');
                        const maxWidth = outerContainer.clientWidth;
                        const maxHeight = outerContainer.clientHeight;
                        const isMobile = window.innerWidth <= 768;
                        
                        let width, height, scale;
                        
                        if (isMobile) {
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
                            const pdfPath = "${pdfUrl}";
                            console.log('Tentando carregar PDF de:', pdfPath);
                            
                            const loadingTask = pdfjsLib.getDocument({
                                url: pdfPath,
                                withCredentials: false
                            });
                            
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
                            
                            const pagePromises = Array.from({ length: pdf.numPages }, (_, i) => {
                                const pageNum = i + 1;
                                return renderPage(pageNum, dimensions.scale).then(pageDiv => {
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
                                const swipeThreshold = 50;
                                const swipeDistance = touchEndX - touchStartX;

                                if (Math.abs(swipeDistance) > swipeThreshold) {
                                    if (swipeDistance > 0) {
                                        prevBtn.click();
                                    } else {
                                        nextBtn.click();
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
                            prevBtn.click();
                        } else if (e.key === 'ArrowRight') {
                            nextBtn.click();
                        }
                    });
                `;

                const { error: jsError } = await supabase.storage
                    .from('flipbooks')
                    .upload(`${flipbookName}/script.js`, Buffer.from(jsContent), {
                        contentType: 'application/javascript',
                        cacheControl: '3600',
                        upsert: true
                    });

                if (jsError) throw jsError;

                const { data: { publicUrl: jsUrl } } = supabase.storage
                    .from('flipbooks')
                    .getPublicUrl(`${flipbookName}/script.js`);

                // Criar uma rota dinâmica para servir o flipbook
                app.get(`/view/${flipbookName}`, (req, res) => {
                    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Flipbook</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUrl}">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/turn.js/3/turn.min.js"></script>
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
        <button id="prevBtn">❮ Anterior</button>
        <span class="page-info">
            Página <span id="currentPage">0</span> de <span id="totalPages">0</span>
        </span>
        <button id="nextBtn">Próxima ❯</button>
    </div>
    <script src="${jsUrl}"></script>
</body>
</html>`);
                });

                const viewUrl = `${req.protocol}://${req.get('host')}/view/${flipbookName}`;
                console.log('URL do Flipbook:', viewUrl);

                const iframeCode = `<iframe src="${viewUrl}" width="100%" height="600" frameborder="0" allow="fullscreen"></iframe>`;

                res.json({
                    success: true,
                    flipbookUrl: viewUrl,
                    pdfUrl,
                    iframeCode
                });

            } catch (error) {
                console.error('Erro detalhado:', error);
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