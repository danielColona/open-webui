<script lang="ts">
	// HeadendAI / ComH3@ - tabela interativa (17/09/2026, pedido do usuario:
	// "classificar, filtrar, copiar uma coluna ou selecionar as que eu quiser").
	//
	// Por que um componente NOVO em vez de editar MarkdownTokens.svelte: o
	// bloco de tabela dele e codigo do upstream, e cada linha nossa ali e
	// conflito no proximo merge (112 commits de distancia). Trazendo o bloco
	// pra ca, o arquivo do upstream fica com UMA chamada em vez de ~90 linhas
	// nossas - o diff contra o upstream DIMINUI.
	//
	// A logica que decide algo (comparar, filtrar, montar a copia) esta em
	// $lib/utils/headendTabela.ts, com teste no vitest. Aqui e so tela.
	import { getContext } from 'svelte';
	const i18n = getContext('i18n');

	import { settings } from '$lib/stores';
	import { copyToClipboard } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	import MarkdownInlineTokens from '$lib/components/chat/Messages/Markdown/MarkdownInlineTokens.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Clipboard from '$lib/components/icons/Clipboard.svelte';
	import Download from '$lib/components/icons/Download.svelte';

	import {
		textoDaCelula,
		ordenarIndices,
		filtrarIndices,
		montarCopia,
		type Direcao
	} from '$lib/utils/headendTabela';

	export let token: any;
	export let id: string;
	export let tokenIdx: number;
	export let done = true;
	export let sourceIds: string[] = [];
	export let onSourceClick: Function = () => {};
	export let ehColunaDeMedida: (t: string | undefined) => boolean = () => false;
	export let ehColunaIdentificador: (t: string | undefined) => boolean = () => false;
	export let onExportCSV: Function = () => {};
	/** A resposta foi cortada antes de chegar aqui (nota do pipe logo abaixo). */
	export let cortada = false;

	let ordem: { coluna: number; direcao: Direcao } | null = null;
	let filtroGeral = '';
	let filtrosPorColuna: string[] = [];
	let mostrarFiltroPorColuna = false;
	let colunasMarcadas: number[] = [];

	$: cabecalhos = (token.header ?? []).map((h: any) => textoDaCelula(h));
	$: linhas = token.rows ?? [];
	$: total = linhas.length;

	$: visiveis = (() => {
		const filtrados = filtrarIndices(linhas, filtroGeral, filtrosPorColuna);
		if (!ordem) return filtrados;
		const posicao = new Map(
			ordenarIndices(linhas, ordem.coluna, ordem.direcao).map((v, i) => [v, i])
		);
		return [...filtrados].sort((a, b) => (posicao.get(a) ?? 0) - (posicao.get(b) ?? 0));
	})();

	$: filtrando = filtroGeral.trim().length > 0 || filtrosPorColuna.some((f) => (f ?? '').trim());

	// Tres estados no clique da seta: crescente -> decrescente -> ordem do
	// motor. A terceira parada existe porque a ordem original carrega
	// informacao (o SQL ja veio com ORDER BY) e nao ha outro jeito de voltar
	// a ela sem reenviar a pergunta.
	const alternarOrdem = (coluna: number) => {
		if (!ordem || ordem.coluna !== coluna) ordem = { coluna, direcao: 'asc' };
		else if (ordem.direcao === 'asc') ordem = { coluna, direcao: 'desc' };
		else ordem = null;
	};

	const alternarMarca = (coluna: number) => {
		colunasMarcadas = colunasMarcadas.includes(coluna)
			? colunasMarcadas.filter((c) => c !== coluna)
			: [...colunasMarcadas, coluna];
	};

	const limpar = () => {
		filtroGeral = '';
		filtrosPorColuna = [];
		ordem = null;
		colunasMarcadas = [];
		mostrarFiltroPorColuna = false;
	};

	const copiar = async (formato: 'tsv' | 'lista') => {
		const texto = montarCopia(cabecalhos, linhas, visiveis, colunasMarcadas, formato);
		await copyToClipboard(texto);
		const quantas = colunasMarcadas.length || cabecalhos.length;
		const nomes =
			colunasMarcadas.length === 1
				? `coluna ${cabecalhos[colunasMarcadas[0]]}`
				: `${quantas} colunas`;
		toast.success(`Copiado: ${nomes}, ${visiveis.length} linha(s)`);
	};
</script>

<div class="relative w-full group mb-2 comh3-tabela">
	<div class="comh3-barra">
		<input
			class="comh3-filtro"
			type="text"
			placeholder="filtrar…"
			bind:value={filtroGeral}
			aria-label="Filtrar linhas da tabela"
		/>

		<button
			type="button"
			class="comh3-botao"
			class:comh3-ativo={mostrarFiltroPorColuna}
			on:click={() => (mostrarFiltroPorColuna = !mostrarFiltroPorColuna)}
			title="Filtro por coluna"
		>
			por coluna
		</button>

		<span class="comh3-contagem">
			{#if filtrando}{visiveis.length} de {total} linhas{:else}{total} linha{total === 1
					? ''
					: 's'}{/if}
		</span>

		<div class="comh3-espaco"></div>

		{#if ordem || filtrando || colunasMarcadas.length}
			<button
				type="button"
				class="comh3-botao"
				on:click={limpar}
				title="Voltar ao que o motor respondeu"
			>
				limpar
			</button>
		{/if}

		<button type="button" class="comh3-botao comh3-copiar" on:click={() => copiar('tsv')}>
			{#if colunasMarcadas.length}copiar {colunasMarcadas.length} coluna{colunasMarcadas.length ===
				1
					? ''
					: 's'}{:else}copiar tabela{/if}
		</button>

		<Tooltip content="Copiar como lista (um valor por linha, sem cabeçalho)">
			<button type="button" class="comh3-botao" on:click={() => copiar('lista')}>lista</button>
		</Tooltip>

		<Tooltip content={$i18n.t('Copy')}>
			<button
				type="button"
				class="comh3-icone"
				on:click={(e) => {
					e.stopPropagation();
					copyToClipboard(token.raw.trim(), null, $settings?.copyFormatted ?? false);
				}}
			>
				<Clipboard className="size-3.5" strokeWidth="1.5" />
			</button>
		</Tooltip>

		<Tooltip content={$i18n.t('Export to CSV')}>
			<button
				type="button"
				class="comh3-icone"
				on:click={(e) => {
					e.stopPropagation();
					onExportCSV(token, tokenIdx);
				}}
			>
				<Download className="size-3.5" strokeWidth="1.5" />
			</button>
		</Tooltip>
	</div>

	{#if ordem && cortada}
		<!-- Ordenar so reordena o que CHEGOU. Numa resposta cortada, o topo
		     e o maior DO RECORTE - a mesma classe de mentira que ja fez o
		     resumo afirmar 18,2 Mbps onde o real era 40. -->
		<div class="comh3-aviso">
			Esta resposta veio cortada — a ordenação vale só sobre as {total} linhas mostradas, não sobre o
			total.
		</div>
	{/if}

	<div
		class="comh3-rolagem relative overflow-x-auto overflow-y-auto max-h-[420px] max-w-full rounded-lg"
	>
		<table
			class="w-full text-sm text-start text-gray-500 dark:text-gray-400 max-w-full rounded-xl"
			dir="auto"
		>
			<thead
				class="text-xs text-gray-700 uppercase dark:text-gray-400 border-none sticky top-0 z-10 bg-white dark:bg-gray-900"
			>
				<tr>
					{#each token.header as header, headerIdx}
						<th
							scope="col"
							class="px-2.5! py-2! font-mono tracking-wide border-b border-gray-100! dark:border-gray-800!"
							class:comh3-marcada={colunasMarcadas.includes(headerIdx)}
							style={token.align[headerIdx] ? `text-align: ${token.align[headerIdx]}` : ''}
						>
							<div class="comh3-cabecalho">
								<button
									type="button"
									class="comh3-marcar"
									on:click={() => alternarMarca(headerIdx)}
									title="Marcar coluna para copiar"
									aria-pressed={colunasMarcadas.includes(headerIdx)}
								>
									<span
										class="comh3-caixa"
										class:comh3-caixa-cheia={colunasMarcadas.includes(headerIdx)}
									></span>
									<span class="shrink-0 break-normal">
										<MarkdownInlineTokens
											id={`${id}-${tokenIdx}-header-${headerIdx}`}
											tokens={header.tokens}
											{done}
											{sourceIds}
											{onSourceClick}
										/>
									</span>
								</button>

								<button
									type="button"
									class="comh3-ordenar"
									class:comh3-ordenando={ordem?.coluna === headerIdx}
									on:click={() => alternarOrdem(headerIdx)}
									title="Ordenar"
								>
									{#if ordem?.coluna === headerIdx}{ordem.direcao === 'asc'
											? '↑'
											: '↓'}{:else}↕{/if}
								</button>
							</div>

							{#if mostrarFiltroPorColuna}
								<input
									class="comh3-filtro-coluna"
									type="text"
									placeholder="…"
									value={filtrosPorColuna[headerIdx] ?? ''}
									on:input={(e) => {
										const copia = [...filtrosPorColuna];
										copia[headerIdx] = e.currentTarget.value;
										filtrosPorColuna = copia;
									}}
									aria-label={`Filtrar coluna ${cabecalhos[headerIdx]}`}
								/>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each visiveis as rowIdx, posicao}
					<tr class="text-xs">
						{#each token.rows[rowIdx] ?? [] as cell, cellIdx}
							<td
								class="px-3! py-2! font-mono [font-variant-numeric:tabular-nums] text-gray-900 dark:text-white w-max {cellIdx ===
									0 || ehColunaIdentificador(cabecalhos[cellIdx])
									? 'text-blue-600 dark:text-blue-400 font-semibold'
									: ''} {ehColunaDeMedida(cabecalhos[cellIdx])
									? 'comh3-medida'
									: ''} {visiveis.length - 1 === posicao
									? ''
									: 'border-b border-gray-50! dark:border-gray-850!'}"
								class:comh3-marcada={colunasMarcadas.includes(cellIdx)}
								style={token.align[cellIdx] ? `text-align: ${token.align[cellIdx]}` : ''}
							>
								<div class="break-normal">
									<MarkdownInlineTokens
										id={`${id}-${tokenIdx}-row-${rowIdx}-${cellIdx}`}
										tokens={cell.tokens}
										{done}
										{sourceIds}
										{onSourceClick}
									/>
								</div>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if filtrando && visiveis.length === 0}
		<div class="comh3-vazio">Nenhuma linha casa com o filtro.</div>
	{/if}
</div>
