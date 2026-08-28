// HeadendAI - cliente da API de sugestoes de perguntas certificadas
// (28/08/2026, ver docs/fork/FORK-autocomplete-certificado.md no repo
// do HeadendAI). Backend SEPARADO do backend proprio do Open WebUI
// (WEBUI_API_BASE_URL) - a API do HeadendAI roda em outro processo/
// porta (FastAPI, projects/python/api/main.py).

const HEADEND_API_BASE_URL =
	(import.meta.env.VITE_HEADEND_API_URL as string | undefined) ?? 'http://localhost:8000';

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
