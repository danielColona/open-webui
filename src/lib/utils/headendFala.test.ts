// HeadendAI - testes do seletor de texto falado.
//
// O que se protege: o TTS fala `message.content` inteiro, e uma resposta
// do HeadendAI tem ate 300 linhas de tabela Markdown. O marcador diz qual
// trecho deve ser lido - e o fallback importa tanto quanto o caminho
// feliz, porque qualquer OUTRO modelo instalado no Open WebUI passa por
// aqui e nao tem marcador nenhum.

import { describe, expect, it } from 'vitest';

import { semMarcadorDeFala, textoParaFala } from './headendFala';

describe('textoParaFala', () => {
	it('fala o trecho marcado, nao a tabela', () => {
		const conteudo = [
			'**13 canais. O maior e TV GAZETA HD - MFP, com 40 megabits por segundo.**',
			'',
			'| SID | Nome |',
			'|---|---|',
			'| 501 | TV GAZETA HD - MFP |',
			'',
			'<!--FALA:13 canais. O maior e TV GAZETA HD - MFP, com 40 megabits por segundo.-->'
		].join('\n');

		expect(textoParaFala(conteudo)).toBe(
			'13 canais. O maior e TV GAZETA HD - MFP, com 40 megabits por segundo.'
		);
		expect(textoParaFala(conteudo)).not.toContain('|');
	});

	it('sem marcador devolve o conteudo - outros modelos seguem iguais', () => {
		// Esta e a garantia que permite mexer no speak() compartilhado sem
		// quebrar o resto do Open WebUI.
		expect(textoParaFala('resposta comum de um LLM')).toBe('resposta comum de um LLM');
		expect(textoParaFala('')).toBe('');
	});

	it('aceita marcador com varias linhas', () => {
		const conteudo = 'tabela\n\n<!--FALA:primeira frase.\nsegunda frase.-->';
		expect(textoParaFala(conteudo)).toBe('primeira frase.\nsegunda frase.');
	});

	it('marcador vazio cai no conteudo, em vez de falar silencio', () => {
		expect(textoParaFala('conteudo\n\n<!--FALA:-->')).toBe('conteudo\n\n<!--FALA:-->');
	});
});

describe('semMarcadorDeFala', () => {
	it('tira o marcador do texto exibido', () => {
		expect(semMarcadorDeFala('resposta\n\n<!--FALA:frase falada-->')).toBe('resposta');
	});
});
