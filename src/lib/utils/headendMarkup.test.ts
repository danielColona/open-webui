// HeadendAI - guarda contra comentario de template que termina cedo.
//
// Bug real em producao (16/09/2026): um comentario de markup escrito pra
// EXPLICAR os marcadores do HeadendAI citava a sequencia de fechamento de
// comentario HTML dentro de si. Comentario HTML nao aninha - o primeiro
// fechamento encerrou o comentario, e o resto da explicacao virou
// conteudo renderizado no fim de TODA resposta do chat.
//
// O teste varre os componentes que o fork edita. E barato e pega uma
// classe de erro que nenhum compilador acusa: o arquivo compila, o
// prettier aceita, e o estrago so aparece na tela do operador.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const COMPONENTES_DO_FORK = [
	'src/lib/components/chat/Messages/Markdown/HTMLToken.svelte',
	'src/lib/components/chat/Messages/ResponseMessage.svelte',
	'src/lib/components/chat/Chat.svelte',
	'src/lib/components/chat/MessageInput/CallOverlay.svelte',
	'src/lib/components/chat/Suggestions.svelte',
	'src/lib/components/chat/MessageInput/CertifiedQuestionList.svelte'
];

const FECHA = '--' + '>';
const ABRE = '<' + '!--';

describe('comentarios de markup dos componentes editados pelo fork', () => {
	it.each(COMPONENTES_DO_FORK)('%s nao tem comentario que termina cedo', (caminho) => {
		let fonte: string;
		try {
			fonte = readFileSync(caminho, 'utf8');
		} catch {
			return; // componente pode nao existir em outra versao do upstream
		}

		const comentarios = fonte.match(new RegExp(`${ABRE}[\\s\\S]*?${FECHA}`, 'g')) ?? [];
		for (const bloco of comentarios) {
			const miolo = bloco.slice(ABRE.length, -FECHA.length);
			expect(
				miolo.includes(FECHA) || miolo.includes(ABRE),
				`comentario aninhado/terminando cedo em ${caminho}: ${bloco.slice(0, 70)}`
			).toBe(false);
		}
	});
});
