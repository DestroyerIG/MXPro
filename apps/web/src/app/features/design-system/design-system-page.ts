import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BrandingService } from '../../core/branding/branding.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Control, FormField } from '../../shared/ui/form-field/form-field';
import { StatTile } from '../../shared/ui/stat-tile/stat-tile';
import { StatusBadge, StatusTone } from '../../shared/ui/status-badge/status-badge';
import { Table } from '../../shared/ui/table/table';
import { TabItem, Tabs } from '../../shared/ui/tabs/tabs';
import { ToastService } from '../../shared/ui/toast/toast.service';

interface DemoRegistration {
  raceNumber: string;
  pilot: string;
  category: string;
  bike: string;
  payment: 'Pago' | 'Pendente';
  inspection: 'Aprovada' | 'Pendente';
}

/**
 * Catálogo do design system (/componentes): mostra cada componente base com dados fictícios do
 * escopo, nos dois temas, e simula a troca de marca do contratante. Ferramenta de desenvolvimento.
 */
@Component({
  selector: 'app-design-system-page',
  imports: [Button, Card, Control, FormField, StatTile, StatusBadge, Table, Tabs],
  templateUrl: './design-system-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignSystemPage {
  protected readonly theme = inject(ThemeService);
  private readonly branding = inject(BrandingService);
  private readonly toasts = inject(ToastService);

  protected readonly themeOptions: TabItem[] = [
    { id: 'system', label: 'Sistema' },
    { id: 'light', label: 'Claro' },
    { id: 'dark', label: 'Escuro' },
  ];
  /** Ponte entre as abas (string) e o ThemeService (tipo restrito). */
  protected readonly themeChoice = signal<string>(this.theme.preference());

  /** Cores de exemplo para simular contratantes; a primeira é a do PDF. */
  protected readonly brandSamples = [
    { name: 'Laranja do PDF', color: '#E8590C' },
    { name: 'Azul', color: '#1C7ED6' },
    { name: 'Vermelho', color: '#C92A2A' },
    { name: 'Amarelo', color: '#FFD43B' },
  ];
  protected readonly brandColor = computed(() => this.branding.branding().primaryColor);

  protected readonly tones: { tone: StatusTone; label: string }[] = [
    { tone: 'ok', label: 'Pronta' },
    { tone: 'warn', label: 'Grid pendente' },
    { tone: 'idle', label: 'Aguardando' },
    { tone: 'danger', label: 'Desclassificado' },
    { tone: 'info', label: 'Controle de horário' },
    { tone: 'brand', label: 'Inscrições abertas' },
  ];

  protected readonly categories: TabItem[] = [
    { id: 'mx1', label: 'MX1' },
    { id: 'mx2', label: 'MX2' },
    { id: 'fem', label: 'Feminino' },
    { id: 'm35', label: 'Master 35+' },
    { id: '65cc', label: '65cc' },
    { id: 'cc', label: 'Cross Country' },
  ];
  protected readonly category = signal('mx2');
  protected readonly categoryLabel = computed(
    () => this.categories.find((c) => c.id === this.category())?.label ?? '',
  );

  protected readonly pilotName = signal('');
  protected readonly nameError = computed(() =>
    this.pilotName().trim().length > 0 && this.pilotName().trim().length < 3 ? 'Digite o nome completo.' : null,
  );

  protected readonly registrations: DemoRegistration[] = [
    { raceNumber: '27', pilot: 'Rafael Menezes', category: 'MX2', bike: 'Honda CRF 250F', payment: 'Pago', inspection: 'Aprovada' },
    { raceNumber: '14', pilot: 'Bruno Tavares', category: 'MX1', bike: 'KTM 450 SX-F', payment: 'Pago', inspection: 'Aprovada' },
    { raceNumber: '88', pilot: 'Lucas Andrade', category: 'MX2', bike: 'Yamaha YZ250F', payment: 'Pendente', inspection: 'Pendente' },
    { raceNumber: '05', pilot: 'Gabriela Nunes', category: 'Feminino', bike: 'Husqvarna FC 250', payment: 'Pago', inspection: 'Aprovada' },
    { raceNumber: '63', pilot: 'Thiago Moura', category: 'Master 35+', bike: 'Kawasaki KX450', payment: 'Pago', inspection: 'Pendente' },
  ];

  protected setTheme(choice: string): void {
    this.themeChoice.set(choice);
    this.theme.preference.set(choice as ThemePreference);
  }

  protected setBrand(color: string): void {
    this.branding.apply({ ...this.branding.branding(), primaryColor: color });
  }

  protected showUndoToast(): void {
    this.toasts.show('Volta registrada: #27, volta 8', {
      action: { label: 'Desfazer', run: () => this.toasts.show('Volta desfeita: #27', { tone: 'ok' }) },
    });
  }

  protected showErrorToast(): void {
    this.toasts.show('Não foi possível enviar 3 lançamentos. Eles continuam salvos neste aparelho.', { tone: 'danger' });
  }
}
