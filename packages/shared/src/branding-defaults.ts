/**
 * Valores padrão da marca SEM depender do Zod: o front importa daqui sem levar a biblioteca de
 * validação para o bundle (o pacote é `sideEffects: false`, então só o que é usado entra).
 */
export const PUBLIC_NAME_DISPLAY = ['FULL_NAME', 'INITIALS'] as const;
export type PublicNameDisplay = (typeof PUBLIC_NAME_DISPLAY)[number];

export interface Branding {
  brandName: string;
  /** Trecho inicial do nome destacado na cor da marca quando não há logo (ex.: "MX"). */
  brandNameAccent: string | null;
  /** #RRGGBB. O front deriva os demais tons com contraste AA. */
  primaryColor: string;
  logoUrl: string | null;
  publicNameDisplay: PublicNameDisplay;
}

/** Marca padrão (escopo): usada quando ainda não há configuração salva. */
export const DEFAULT_BRANDING: Branding = {
  brandName: 'MXPRO',
  brandNameAccent: 'MX',
  primaryColor: '#E8590C',
  logoUrl: null,
  publicNameDisplay: 'FULL_NAME',
};
