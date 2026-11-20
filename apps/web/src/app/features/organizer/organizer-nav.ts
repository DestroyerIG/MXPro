/** Itens do menu lateral do organizador, na ordem do escopo (docs/arquitetura.md §4.1). */
export interface NavItem {
  /** Caminho relativo a /painel ('' = a própria página do painel). */
  path: string;
  label: string;
  /** O que a área vai fazer; mostrado enquanto ela não existe. */
  description: string;
}

export const ORGANIZER_NAV: readonly NavItem[] = [
  { path: '', label: 'Painel', description: '' },
  { path: 'eventos', label: 'Eventos', description: 'Cadastro de campeonatos, etapas e baterias, e o wizard de configuração da prova.' },
  { path: 'categorias', label: 'Categorias', description: 'Categorias do evento (MX1, MX2, Feminino…), vagas e valor de inscrição.' },
  { path: 'inscricoes', label: 'Inscrições', description: 'Lista de inscritos com filtros, pagamento, vistoria, número de largada e grid.' },
  { path: 'cronometragem', label: 'Cronometragem', description: 'Baterias e especiais para cronometrar, e acesso à tela de pista.' },
  { path: 'resultados', label: 'Resultados', description: 'Resultados por bateria, fechamento e resultado oficial em PDF e planilha.' },
  { path: 'campeonato', label: 'Campeonato', description: 'Pontuação etapa a etapa, descarte e desempate.' },
  { path: 'financeiro', label: 'Financeiro', description: 'Pagamentos Pix, conciliação, estornos e baixas manuais.' },
  { path: 'equipe', label: 'Equipe', description: 'Usuários da organização e seus perfis (secretaria, cronometristas).' },
];
