// HeadendAI - cliente da API de sugestoes de perguntas certificadas
// (28/08/2026, ver docs/fork/FORK-autocomplete-certificado.md no repo
// do HeadendAI). Backend SEPARADO do backend proprio do Open WebUI
// (WEBUI_API_BASE_URL) - a API do HeadendAI roda em outro processo/
// porta (FastAPI, projects/python/api/main.py).

// Vazio = MESMA ORIGEM (07/09/2026). O padrao era o endereco publico do
// proxy reverso, cravado no Dockerfile e no workflow - ou seja, o IP e a
// porta da API do headend ficavam num repositorio publico. Com o valor
// vazio, a chamada sai como caminho relativo (/consulta/sugestoes) e vai
// pra propria origem da pagina: nenhum endereco entra no bundle, e de
// quebra some o CORS e o mixed content, que ja custaram tres bugs em
// cadeia na Sprint 09.
//
// Isso exige que a API esteja publicada sob a MESMA origem da interface
// (uma regra de proxy a mais no Apache). Enquanto nao estiver, defina
// VITE_HEADEND_API_URL - em .env local pro `vite dev` (a API roda na 8000
// e a pagina na 5173, origens diferentes) e na variavel HEADEND_API_URL do
// repositorio pro build do CI.
const HEADEND_API_BASE_URL = (import.meta.env.VITE_HEADEND_API_URL as string | undefined) ?? '';

export type CertifiedSuggestion = {
	texto: string;
	intencao: string;
};

export const getCertifiedSuggestions = async (
	parcial: string,
	signal?: AbortSignal
): Promise<CertifiedSuggestion[]> => {
	if (!parcial || parcial.trim().length < 2) {
		return [];
	}

	const url = `${HEADEND_API_BASE_URL}/consulta/sugestoes?${new URLSearchParams({
		parcial
	}).toString()}`;

	const res = await fetch(url, { signal });
	if (!res.ok) {
		throw new Error(`HeadendAI sugestoes: HTTP ${res.status}`);
	}
	const data = await res.json();
	return data?.sugestoes ?? [];
};
