// HeadendAI / ComH3@ - tabela interativa no chat (17/09/2026).
//
// Pedido do usuario: classificar, filtrar e copiar coluna(s) das tabelas
// que o motor devolve. Toda a logica que DECIDE algo mora aqui, fora do
// componente Svelte, por dois motivos: da pra testar no vitest sem montar
// DOM (o fork nao tem jsdom nem @testing-library), e o componente fica
// sendo so apresentacao.
//
// A parte delicada e a ORDENACAO. As tabelas do motor misturam, nas mesmas
// colunas, coisas que ordenam de jeitos diferentes:
//
//   taxa      "136.0", "3.6"    -> numero (ponto decimal: vem de round()
//                                  em Python, nao da formatacao falada)
//   multicast "225.0.0.99"      -> IP, tem que comparar octeto a octeto
//   porta     "Port 3"          -> texto+numero, Port 10 vem DEPOIS de Port 9
//   host      "VTARFGTVD11"     -> idem, o 11 e numero no meio do nome
//   vazio     "-"               -> o pipe escreve "-" pra None; nunca "ganha"
//
// Ordenar taxa como texto poria "9.0" acima de "40.0", e isso e a classe de
// erro mais cara do projeto (um resumo ja afirmou 18,2 Mbps onde o real era
// 40). Por isso: numero de verdade compara como numero; todo o resto usa
// Intl.Collator com numeric:true, que resolve IP, "Port 10" e "VTARFGTVD11"
// de uma vez so - comparando pedaco numerico com pedaco numerico.

/** O pipe escreve isto quando o valor da linha e None. */
const VAZIO = new Set(['', '-', '—', 'n/a', 'null', 'none']);

// Numero com unidade opcional: "136.0", "3,6", "-12", "40 Mbps", "98,5 %",
// "1080i". Um IP ("225.0.0.99") NAO casa, porque so um separador decimal e
// aceito - e e exatamente o que queremos: IP cai no colator, que o ordena
// octeto a octeto.
const NUMERO_COM_UNIDADE = /^([+-]?\d+(?:[.,]\d+)?)\s*(?:[a-zA-Z%°º/]+\d*)?$/;

const colator = new Intl.Collator('pt-BR', {
	numeric: true,
	sensitivity: 'base'
});

/** Texto cru de uma celula do token de tabela do `marked`. */
export function textoDaCelula(celula: any): string {
	if (celula == null) return '';
	if (typeof celula === 'string') return celula;
	if (Array.isArray(celula?.tokens)) {
		return celula.tokens.map((t: any) => t?.text ?? t?.raw ?? '').join('');
	}
	return celula?.text ?? '';
}

export function estaVazio(texto: string): boolean {
	return VAZIO.has(texto.trim().toLowerCase());
}

/**
 * O valor numerico de uma celula, ou `null` quando ela nao e um numero.
 * `null` NAO quer dizer erro: quer dizer "compare isto como texto".
 */
export function numeroDe(texto: string): number | null {
	const limpo = (texto ?? '').trim();
	if (!limpo || estaVazio(limpo)) return null;
	const casou = NUMERO_COM_UNIDADE.exec(limpo);
	if (!casou) return null;
	const n = Number(casou[1].replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}

/**
 * Compara duas celulas. Celula vazia vai SEMPRE pro fim, nos dois sentidos
 * - "-" no topo de uma ordenacao por taxa nao informa nada, so empurra o
 * dado pra fora da tela.
 */
export function compararCelulas(a: string, b: string): number {
	const aVazio = estaVazio(a);
	const bVazio = estaVazio(b);
	if (aVazio && bVazio) return 0;
	if (aVazio) return 1;
	if (bVazio) return -1;

	const na = numeroDe(a);
	const nb = numeroDe(b);
	if (na !== null && nb !== null) return na - nb;

	return colator.compare(a, b);
}

export type Direcao = 'asc' | 'desc';

/**
 * Os indices das linhas na ordem pedida. Devolve INDICES, nunca as linhas
 * reordenadas: o token do `marked` continua intacto, entao "copiar tabela"
 * e "exportar CSV" (que leem `token.raw`/`token.rows`) seguem exportando o
 * que o motor mandou, e voltar pra ordem original e so descartar isto.
 *
 * Empate preserva a ordem do motor (ordenacao estavel): o SQL ja veio com
 * ORDER BY e essa ordem carrega informacao.
 */
export function ordenarIndices(linhas: any[][], coluna: number, direcao: Direcao): number[] {
	const indices = linhas.map((_, i) => i);
	const chave = (i: number) => textoDaCelula(linhas[i]?.[coluna]);
	const sinal = direcao === 'desc' ? -1 : 1;
	return indices.sort((i, j) => {
		const a = chave(i);
		const b = chave(j);

		// O vazio fica no fim NOS DOIS SENTIDOS, entao ele e resolvido ANTES
		// de aplicar o sinal. Inverter o resultado inteiro (bug pego pelo
		// teste) jogava todo "-" pro topo da ordem decrescente - justo o
		// lugar onde o operador procura o maior valor.
		const aVazio = estaVazio(a);
		const bVazio = estaVazio(b);
		if (aVazio || bVazio) {
			if (aVazio && bVazio) return i - j;
			return aVazio ? 1 : -1;
		}

		const r = compararCelulas(a, b);
		return r !== 0 ? r * sinal : i - j;
	});
}

/** Sem acento e em minuscula, pro filtro casar "vitoria" com "VITÓRIA". */
export function dobrar(texto: string): string {
	return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Indices das linhas que passam nos filtros. `geral` casa em QUALQUER
 * coluna; `porColuna[i]` casa so na coluna i. Os dois juntos sao E.
 */
export function filtrarIndices(linhas: any[][], geral: string, porColuna: string[] = []): number[] {
	const alvo = dobrar(geral).trim();
	const colunas = porColuna.map((t) => dobrar(t ?? '').trim());
	const temColuna = colunas.some((t) => t.length > 0);
	if (!alvo && !temColuna) return linhas.map((_, i) => i);

	const passa = (linha: any[]) => {
		if (alvo) {
			const inteira = dobrar(linha.map(textoDaCelula).join(' '));
			if (!inteira.includes(alvo)) return false;
		}
		for (let c = 0; c < colunas.length; c++) {
			if (!colunas[c]) continue;
			if (!dobrar(textoDaCelula(linha[c])).includes(colunas[c])) return false;
		}
		return true;
	};

	const saida: number[] = [];
	linhas.forEach((linha, i) => {
		if (passa(linha)) saida.push(i);
	});
	return saida;
}

/**
 * Texto pra area de transferencia.
 *
 * "tsv": uma linha por registro, colunas separadas por TAB - e o que o
 *   Excel/LibreOffice entende como colunas ao colar, sem assistente de
 *   importacao. Leva o cabecalho junto.
 * "lista": so os valores, um por linha, sem cabecalho - pra colar num
 *   chamado ou num comando. Com mais de uma coluna marcada, junta com
 *   espaco, que e como o operador escreveria na mao.
 */
export function montarCopia(
	cabecalhos: string[],
	linhas: any[][],
	indices: number[],
	colunas: number[],
	formato: 'tsv' | 'lista'
): string {
	const cols = colunas.length ? [...colunas].sort((a, b) => a - b) : cabecalhos.map((_, i) => i);
	const corpo = indices.map((i) => cols.map((c) => textoDaCelula(linhas[i]?.[c]).trim()));
	if (formato === 'lista') {
		return corpo.map((linha) => linha.join(' ')).join('\n');
	}
	const topo = cols.map((c) => (cabecalhos[c] ?? '').trim());
	return [topo, ...corpo].map((linha) => linha.join('\t')).join('\n');
}

/**
 * A tabela foi cortada antes de chegar na tela?
 *
 * Importa porque ordenar no navegador so reordena o que CHEGOU: numa
 * resposta cortada, o topo de "maior taxa" e o maior DO RECORTE. O pipe
 * escreve a nota de corte como paragrafo logo depois da tabela (ver
 * _tabela_unica em pipe_headendai.py), entao a checagem e olhar o token
 * seguinte - nao ha outro canal entre pipe e componente.
 */
export function tabelaFoiCortada(tokens: any[], indiceDaTabela: number): boolean {
	const proximo = tokens?.[indiceDaTabela + 1];
	if (!proximo || proximo.type !== 'paragraph') return false;
	return /n[ãa]o mostradas/i.test(proximo.raw ?? proximo.text ?? '');
}

/**
 * Quantas linhas a tabela desenha de cada vez (17/09/2026).
 *
 * A mensagem agora traz a resposta INTEIRA (ate 1000 linhas, o teto do
 * motor): filtro, ordenacao e copia valem sobre tudo. O que fica limitado e
 * so o DESENHO - 1000 x 18 colunas sao 18 mil celulas, e o operador pede
 * mais com um clique. Dado completo, desenho sob demanda.
 */
export const LOTE_PINTURA = 200;

/**
 * O texto de uma celula que e SO texto, ou `null` se ela tiver qualquer
 * outra coisa (a etiqueta `MUX` e codigo inline, `\|` vira token de escape).
 *
 * Existe pra desenhar a celula comum direto, sem montar um componente
 * Svelte por celula. A saida e IDENTICA: com a resposta completa, o
 * TextToken do Open WebUI desenha exatamente `token.raw` (conferido em
 * MarkdownInlineTokens/TextToken.svelte) - e o Svelte escapa o texto do
 * mesmo jeito nos dois caminhos, entao "A&E" continua "A&E".
 */
export function textoSimples(celula: any): string | null {
	const tokens = celula?.tokens;
	if (!Array.isArray(tokens)) return null;
	if (!tokens.every((t: any) => t?.type === 'text')) return null;
	return tokens.map((t: any) => t.raw ?? '').join('');
}

/**
 * Largura minima (em `ch`) para o titulo de uma coluna caber em DUAS
 * linhas (17/09/2026).
 *
 * O bug que motivou: com `overflow-wrap: break-word`, a largura minima de
 * uma celula de cabecalho vira UM caractere, e numa tabela larga o
 * navegador espremia a coluna ate o titulo virar texto vertical, letra por
 * letra. Quebrar so entre palavras resolve o vertical, mas ai a largura
 * minima passa a ser a maior PALAVRA - "Taxa atual (Mbps)" viraria tres
 * linhas ("Taxa" / "atual" / "(Mbps)").
 *
 * Entao a largura e escolhida aqui: o melhor corte em duas linhas, ou seja
 * o que deixa a linha mais longa o menor possivel. "Taxa atual (Mbps)" da
 * 10 ("Taxa atual" / "(Mbps)"); "SID" da 3. O teto de 18 evita que um
 * titulo enorme domine a tabela - se precisar de uma terceira linha, o CSS
 * corta com reticencias e o nome inteiro fica no `title` do elemento.
 */
export function larguraDoTitulo(texto: string, teto = 18): number {
	const palavras = (texto ?? '').trim().split(/\s+/).filter(Boolean);
	if (palavras.length === 0) return 3;
	if (palavras.length === 1) return Math.min(teto, palavras[0].length);

	let melhor = Infinity;
	for (let corte = 1; corte < palavras.length; corte++) {
		const a = palavras.slice(0, corte).join(' ').length;
		const b = palavras.slice(corte).join(' ').length;
		melhor = Math.min(melhor, Math.max(a, b));
	}
	return Math.min(teto, melhor);
}
