import { CONSENT_DOCUMENT_VERSION } from '@mxpro/shared';

/**
 * Textos aceitos na inscrição. PROVISÓRIOS: o texto final vem do contratante (jurídico).
 * A versão aceita fica registrada em cada consentimento (CONSENT_DOCUMENT_VERSION); ao trocar o
 * texto, trocar também a versão.
 */
export const LEGAL_VERSION = CONSENT_DOCUMENT_VERSION;
export const LEGAL_PROVISIONAL = true;

export const LIABILITY_WAIVER: readonly string[] = [
  'Declaro que estou em boas condições de saúde e apto(a) a participar de prova de motociclismo off-road, atividade de risco que pode causar lesões graves.',
  'Comprometo-me a usar o equipamento de segurança obrigatório (capacete, botas, luvas, protetores) e a seguir o regulamento da prova e as orientações dos fiscais.',
  'Assumo a responsabilidade pela minha motocicleta e pelos danos que eu causar a terceiros, e autorizo a organização a acionar atendimento médico de emergência em meu nome.',
];

export const PRIVACY_POLICY: readonly string[] = [
  'Coletamos só o necessário para a inscrição e a prova: nome, e-mail, número de largada, categoria, moto, equipe e os dados do pagamento.',
  'Em páginas públicas e no telão aparecem apenas número, nome (ou iniciais, conforme a organização) e equipe. E-mail e dados de pagamento nunca são exibidos.',
  'Você pode pedir a qualquer momento uma cópia dos seus dados ou a anonimização da sua conta, falando com a organização do evento.',
];
