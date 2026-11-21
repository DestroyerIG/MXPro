import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/**
 * QR Code do Pix, desenhado no navegador a partir do "copia e cola" (o mesmo texto que o banco lê).
 *
 * Em vez de injetar um SVG pronto como HTML (o Angular o "sanitizaria" por segurança), montamos o
 * desenho com binding de atributos: um único <path> com um quadradinho por módulo escuro. Fica
 * nítido em qualquer tamanho e não depende da imagem do Mercado Pago (que vem vazia na sandbox).
 */
@Component({
  selector: 'app-pix-qr',
  template: `
    <svg
      role="img"
      [attr.aria-label]="label()"
      [attr.viewBox]="viewBox()"
      shape-rendering="crispEdges"
      class="block h-auto w-full rounded-md bg-white"
    >
      <path [attr.d]="path()" fill="#000" />
    </svg>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixQr {
  /** Pix "copia e cola" (BR Code). */
  readonly payload = input.required<string>();
  readonly label = input('QR Code do Pix');

  /** Margem branca obrigatória ao redor do código (4 módulos, padrão do QR Code). */
  private static readonly QUIET = 4;

  private readonly matrix = computed(() => {
    // Versão automática (0) e correção "M": o padrão usado pelos bancos para Pix.
    const qr = qrcode(0, 'M');
    qr.addData(this.payload());
    qr.make();
    return qr;
  });

  protected readonly viewBox = computed(() => {
    const size = this.matrix().getModuleCount() + PixQr.QUIET * 2;
    return `0 0 ${size} ${size}`;
  });

  protected readonly path = computed(() => {
    const qr = this.matrix();
    const n = qr.getModuleCount();
    const q = PixQr.QUIET;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
      }
    }
    return d;
  });
}
