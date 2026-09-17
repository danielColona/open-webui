import { describe, it, expect } from 'vitest';
import {
	numeroDe,
	compararCelulas,
	ordenarIndices,
	filtrarIndices,
	montarCopia,
	tabelaFoiCortada,
	textoDaCelula,
	textoSimples
} from './headendTabela';

// Celula no formato que o `marked` entrega.
const c = (texto: string) => ({ text: texto, tokens: [{ text: texto }] });
const linha = (...valores: string[]) => valores.map(c);

describe('numeroDe', () => {
	it('le o que o motor escreve de verdade (Python round(), ponto decimal)', () => {
		expect(numeroDe('136.0')).toBe(136);
		expect(numeroDe('3.6')).toBe(3.6);
		expect(numeroDe('539')).toBe(539);
		expect(numeroDe('-12')).toBe(-12);
	});

	it('aceita virgula decimal e unidade coladas do lado', () => {
		expect(numeroDe('3,6')).toBe(3.6);
		expect(numeroDe('40 Mbps')).toBe(40);
		expect(numeroDe('98,5 %')).toBe(98.5);
	});

	it('NAO trata IP como numero - senao 225.0.0.99 viraria 225', () => {
		expect(numeroDe('225.0.0.99')).toBeNull();
		expect(numeroDe('239.4.2.23')).toBeNull();
	});

	it('NAO trata texto com numero no meio como numero', () => {
		expect(numeroDe('Port 3')).toBeNull();
		expect(numeroDe('VTARFGTVD11 - VTA')).toBeNull();
		expect(numeroDe('SPORTV 2 HD')).toBeNull();
	});

	it('vazio do pipe nao e numero', () => {
		expect(numeroDe('-')).toBeNull();
		expect(numeroDe('')).toBeNull();
	});
});

describe('compararCelulas', () => {
	it('taxa compara como NUMERO, nao como texto', () => {
		// O erro classico: ordenado como texto, "9.0" fica acima de "40.0".
		expect(compararCelulas('40.0', '9.0')).toBeGreaterThan(0);
		expect(compararCelulas('3.55', '3.6')).toBeLessThan(0);
	});

	it('IP compara octeto a octeto', () => {
		expect(compararCelulas('225.0.0.9', '225.0.0.10')).toBeLessThan(0);
		expect(compararCelulas('68.0.0.1', '225.0.0.1')).toBeLessThan(0);
	});

	it('Port 10 vem depois de Port 9', () => {
		expect(compararCelulas('Port 9', 'Port 10')).toBeLessThan(0);
	});

	it('vazio vai pro fim nos DOIS sentidos', () => {
		expect(compararCelulas('-', '40.0')).toBeGreaterThan(0);
		expect(compararCelulas('40.0', '-')).toBeLessThan(0);
	});

	it('ignora acento e caixa no texto', () => {
		expect(compararCelulas('VITÓRIA', 'vitoria')).toBe(0);
	});
});

describe('ordenarIndices', () => {
	const linhas = [
		linha('225.0.0.99', '136.0'),
		linha('234.0.85.123', '9.0'),
		linha('239.4.2.23', '40.0'),
		linha('225.0.0.76', '-')
	];

	it('ordena taxa decrescente sem cair na armadilha do texto', () => {
		const ordem = ordenarIndices(linhas, 1, 'desc');
		expect(ordem.map((i) => textoDaCelula(linhas[i][1]))).toEqual([
			'136.0',
			'40.0',
			'9.0',
			'-' // vazio no fim mesmo em desc
		]);
	});

	it('ordena IP crescente', () => {
		const ordem = ordenarIndices(linhas, 0, 'asc');
		expect(ordem.map((i) => textoDaCelula(linhas[i][0]))).toEqual([
			'225.0.0.76',
			'225.0.0.99',
			'234.0.85.123',
			'239.4.2.23'
		]);
	});

	it('empate preserva a ordem que o motor mandou', () => {
		const iguais = [linha('a', '5.0'), linha('b', '5.0'), linha('c', '5.0')];
		expect(ordenarIndices(iguais, 1, 'asc')).toEqual([0, 1, 2]);
		expect(ordenarIndices(iguais, 1, 'desc')).toEqual([0, 1, 2]);
	});

	it('nao modifica as linhas originais', () => {
		const antes = JSON.stringify(linhas);
		ordenarIndices(linhas, 1, 'desc');
		expect(JSON.stringify(linhas)).toBe(antes);
	});
});

describe('filtrarIndices', () => {
	const linhas = [
		linha('539', 'SPORTV HD', 'Port 3'),
		linha('540', 'SPORTV 2 HD', 'Port 1'),
		linha('517', 'TV VITÓRIA', 'Port 3')
	];

	it('sem filtro devolve tudo', () => {
		expect(filtrarIndices(linhas, '')).toEqual([0, 1, 2]);
	});

	it('filtro geral casa em qualquer coluna', () => {
		expect(filtrarIndices(linhas, 'sportv')).toEqual([0, 1]);
		expect(filtrarIndices(linhas, 'port 1')).toEqual([1]);
	});

	it('filtro geral ignora acento', () => {
		expect(filtrarIndices(linhas, 'vitoria')).toEqual([2]);
	});

	it('filtro por coluna nao vaza pras outras', () => {
		// "3" existe no SID 539 e na Port 3; preso a coluna da porta, so a porta conta.
		expect(filtrarIndices(linhas, '', ['', '', '3'])).toEqual([0, 2]);
	});

	it('geral e por coluna se somam (E, nao OU)', () => {
		expect(filtrarIndices(linhas, 'sportv', ['', '', 'Port 3'])).toEqual([0]);
	});
});

describe('montarCopia', () => {
	const cabecalhos = ['SID', 'Canal', 'Taxa'];
	const linhas = [linha('539', 'SPORTV HD', '3.6'), linha('540', 'SPORTV 2 HD', '3.4')];

	it('TSV leva cabecalho e separa por TAB (cola no Excel em colunas)', () => {
		const saida = montarCopia(cabecalhos, linhas, [0, 1], [0, 1], 'tsv');
		expect(saida).toBe('SID\tCanal\n539\tSPORTV HD\n540\tSPORTV 2 HD');
	});

	it('lista nao leva cabecalho', () => {
		expect(montarCopia(cabecalhos, linhas, [0, 1], [0], 'lista')).toBe('539\n540');
	});

	it('sem coluna marcada copia a tabela toda', () => {
		const saida = montarCopia(cabecalhos, linhas, [0], [], 'tsv');
		expect(saida).toBe('SID\tCanal\tTaxa\n539\tSPORTV HD\t3.6');
	});

	it('copia na ordem das COLUNAS, nao na ordem em que foram marcadas', () => {
		const saida = montarCopia(cabecalhos, linhas, [0], [2, 0], 'tsv');
		expect(saida).toBe('SID\tTaxa\n539\t3.6');
	});

	it('copia so as linhas visiveis, na ordem visivel', () => {
		const saida = montarCopia(cabecalhos, linhas, [1], [1], 'lista');
		expect(saida).toBe('SPORTV 2 HD');
	});
});

describe('tabelaFoiCortada', () => {
	// O texto real que _tabela_unica (pipe_headendai.py) escreve depois da tabela.
	const nota = (raw: string) => ({ type: 'paragraph', raw });

	it('reconhece a nota de corte do pipe', () => {
		const tokens = [{ type: 'table' }, nota('_...e mais 28 linha(s), não mostradas._')];
		expect(tabelaFoiCortada(tokens, 0)).toBe(true);
	});

	it('reconhece tambem a forma "mais de N" (motor ja tinha cortado)', () => {
		const tokens = [{ type: 'table' }, nota('_...e mais de 800 linha(s), não mostradas._')];
		expect(tabelaFoiCortada(tokens, 0)).toBe(true);
	});

	it('tabela inteira nao e marcada como cortada', () => {
		expect(tabelaFoiCortada([{ type: 'table' }], 0)).toBe(false);
		expect(tabelaFoiCortada([{ type: 'table' }, nota('outra coisa')], 0)).toBe(false);
	});
});

describe('textoSimples', () => {
	it('celula so de texto sai como o raw, igual ao TextToken', () => {
		expect(textoSimples({ tokens: [{ type: 'text', raw: 'SPORTV HD', text: 'SPORTV HD' }] })).toBe(
			'SPORTV HD'
		);
	});

	it('ampersand do nome real do canal passa intacto (o Svelte escapa na saida)', () => {
		expect(textoSimples({ tokens: [{ type: 'text', raw: 'MHE A&E MUNDO SD RJO' }] })).toBe(
			'MHE A&E MUNDO SD RJO'
		);
	});

	it('celula com a etiqueta MUX (codigo inline) vai pro componente', () => {
		const celula = {
			tokens: [
				{ type: 'text', raw: 'TS06 ' },
				{ type: 'codespan', raw: '`MUX`', text: 'MUX' }
			]
		};
		expect(textoSimples(celula)).toBeNull();
	});

	it('celula com barra escapada (\\|) vai pro componente', () => {
		expect(textoSimples({ tokens: [{ type: 'escape', raw: '\\|', text: '|' }] })).toBeNull();
	});

	it('celula vazia sai vazia', () => {
		expect(textoSimples({ tokens: [] })).toBe('');
	});

	it('forma inesperada vai pro componente, nunca estoura', () => {
		expect(textoSimples(undefined)).toBeNull();
		expect(textoSimples({})).toBeNull();
	});
});
