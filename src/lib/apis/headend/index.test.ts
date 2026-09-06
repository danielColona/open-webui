// HeadendAI - testes do cliente da API de sugestoes certificadas.
//
// Primeiro teste de frontend do fork. Escolhido por ser o unico codigo
// nosso aqui que da pra testar com o vitest que o projeto JA tem: e
// fetch puro, sem componente Svelte. Montar componente exigiria jsdom +
// @testing-library, que o fork nao tem - dependencia nova nao entra so
// por causa de teste (ficou registrado como proximo passo, nao como
// esquecimento).
//
// O que se protege aqui: este cliente e chamado a CADA TECLA que o
// operador digita (debounce de 200ms no componente). Erro de contrato
// nele nao aparece como erro na tela - o dropdown so fica vazio.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCertifiedSuggestions } from './index';

const respostaOk = (corpo: unknown) => ({
	ok: true,
	status: 200,
	json: async () => corpo
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('getCertifiedSuggestions', () => {
	it('nao chama a rede com texto curto demais', async () => {
		const fetchFalso = vi.fn();
		vi.stubGlobal('fetch', fetchFalso);

		expect(await getCertifiedSuggestions('')).toEqual([]);
		expect(await getCertifiedSuggestions('q')).toEqual([]);
		expect(await getCertifiedSuggestions('  ')).toEqual([]);

		// A guarda e do lado do cliente de proposito: sem ela, cada tecla
		// isolada viraria uma chamada HTTP que o backend ja responderia
		// vazia. E economia de rede, nao de logica.
		expect(fetchFalso).not.toHaveBeenCalled();
	});

	it('devolve as sugestoes do corpo da resposta', async () => {
		const sugestoes = [
			{ texto: 'quantos canais temos no total?', intencao: 'contagem_inventario' }
		];
		vi.stubGlobal('fetch', vi.fn(async () => respostaOk({ sugestoes })));

		expect(await getCertifiedSuggestions('quantos can')).toEqual(sugestoes);
	});

	it('monta a URL com o parcial codificado', async () => {
		const fetchFalso = vi.fn(async () => respostaOk({ sugestoes: [] }));
		vi.stubGlobal('fetch', fetchFalso);

		await getCertifiedSuggestions('taxa da ts 30 & 31');

		const url = fetchFalso.mock.calls[0][0] as string;
		expect(url).toContain('/consulta/sugestoes?');
		// Acento e "&" sao comuns nas perguntas reais do operador e
		// quebrariam a query se fossem concatenados crus.
		expect(url).toContain('parcial=taxa+da+ts+30+%26+31');
	});

	it('trata resposta sem o campo sugestoes como lista vazia', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => respostaOk({})));
		expect(await getCertifiedSuggestions('quantos can')).toEqual([]);
	});

	it('propaga erro HTTP em vez de devolver lista vazia em silencio', async () => {
		// Diferenca que importa: lista vazia significa "nao ha sugestao",
		// e API fora do ar significa outra coisa. Quem chama decide o que
		// mostrar; engolir aqui apagaria a distincao.
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
		await expect(getCertifiedSuggestions('quantos can')).rejects.toThrow('HTTP 502');
	});

	it('repassa o AbortSignal para o fetch', async () => {
		// O componente cancela a chamada anterior a cada tecla nova; sem
		// repassar o signal, respostas atrasadas voltariam fora de ordem e
		// sobrescreveriam a lista do que o operador acabou de digitar.
		const fetchFalso = vi.fn(async () => respostaOk({ sugestoes: [] }));
		vi.stubGlobal('fetch', fetchFalso);

		const controle = new AbortController();
		await getCertifiedSuggestions('quantos can', controle.signal);

		expect(fetchFalso.mock.calls[0][1]).toMatchObject({ signal: controle.signal });
	});
});
