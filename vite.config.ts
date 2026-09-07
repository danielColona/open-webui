import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

import { viteStaticCopy } from 'vite-plugin-static-copy';

const backendTarget = process.env.WEBUI_BACKEND_URL || 'http://localhost:8080';

// HeadendAI (30/08/2026): sem isso, o cliente de HMR injetado no navegador
// grava a porta INTERNA do Vite (5173) pra reconectar o WebSocket. Atras de
// um proxy reverso, a porta interna nao esta liberada externamente - so a do
// proxy - entao o socket de HMR falha e fica retentando em loop (sintoma:
// pagina carrega, conexao "oscila" depois). So ativa quando
// VITE_HMR_CLIENT_PORT esta definida, pra nao quebrar acesso direto (dev
// local batendo na 5173 sem passar pelo proxy).
// 07/09/2026: enderecos reais sairam deste comentario - o repositorio e
// publico (ver Dockerfile, mesma razao).
const hmrConfig = process.env.VITE_HMR_CLIENT_PORT
	? {
			clientPort: Number(process.env.VITE_HMR_CLIENT_PORT),
			protocol: process.env.VITE_HMR_PROTOCOL || 'wss'
		}
	: undefined;

export default defineConfig({
	plugins: [
		sveltekit(),
		viteStaticCopy({
			targets: [
				{
					src: 'node_modules/onnxruntime-web/dist/*.jsep.*',

					dest: 'wasm'
				}
			]
		})
	],
	define: {
		APP_VERSION: JSON.stringify(process.env.npm_package_version),
		APP_BUILD_HASH: JSON.stringify(process.env.APP_BUILD_HASH || 'dev-build')
	},
	build: {
		// ComH3@ (05/09/2026): desligado sob pressao real de memoria no host
		// (8GB, sem folga) - sourcemap de um app deste tamanho e um dos
		// maiores consumidores de RAM/heap do vite build (~3-4 builds
		// consecutivos deste dia derrubaram o build por OOM mesmo com
		// NODE_OPTIONS=4096MB e o host sem outros consumidores obvios).
		// Nao afeta o app rodando - so perde mapa de codigo-fonte original
		// no DevTools do navegador pra esse build especifico.
		sourcemap: false,
		// Mesma pressao de memoria - minify (esbuild) processa o bundle
		// inteiro de uma vez na etapa de "rendering chunks", exatamente
		// onde o build morreu por OOM. Bundle final fica maior/sem
		// minificar, mas funciona identico - troca aceitavel pra
		// destravar o deploy neste host sem folga de RAM.
		minify: false
	},
	server: {
		proxy: {
			'/api': {
				target: backendTarget,
				changeOrigin: true,
				ws: true
			},
			'/ollama': {
				target: backendTarget,
				changeOrigin: true
			},
			'/openai': {
				target: backendTarget,
				changeOrigin: true
			},
			'/oauth': {
				target: backendTarget,
				changeOrigin: true
			},
			'/ws': {
				target: backendTarget,
				changeOrigin: true,
				ws: true
			}
		},
		// HeadendAI (28/08/2026): exclui backend/ do watcher do Vite. Sem isso,
		// o watcher tenta vigiar o .venv Python do backend (dezenas de milhares
		// de arquivos de torch/transformers/chromadb) e estoura o limite de
		// inotify watches do Linux (ENOSPC), derrubando o dev server.
		watch: {
			ignored: ['**/backend/**']
		},
		hmr: hmrConfig
	},
	worker: {
		format: 'es'
	},
	esbuild: {
		pure: process.env.ENV === 'dev' ? [] : ['console.log', 'console.debug', 'console.error']
	}
});
