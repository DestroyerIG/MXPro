import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BrandingService } from '../../core/branding/branding.service';

/**
 * Logo do contratante. Com `logoUrl`, mostra a imagem; sem, desenha o nome com o trecho
 * inicial na cor da marca (padrão do PDF: "MX" laranja + "PRO" branco).
 * Nunca hardcoded: tudo vem do BrandingService.
 */
@Component({
  selector: 'app-brand-logo',
  template: `
    @if (branding().logoUrl; as url) {
      <img [src]="url" [alt]="branding().brandName" class="h-8 w-auto" />
    } @else {
      <span class="text-2xl font-extrabold tracking-tight">
        <span class="text-brand">{{ accent() }}</span>{{ rest() }}
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandLogo {
  protected readonly branding = inject(BrandingService).branding;

  protected readonly accent = computed(() => {
    const { brandName, brandNameAccent } = this.branding();
    return brandNameAccent && brandName.startsWith(brandNameAccent) ? brandNameAccent : '';
  });
  protected readonly rest = computed(() => this.branding().brandName.slice(this.accent().length));
}
