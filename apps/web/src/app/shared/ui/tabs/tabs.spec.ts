import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type TabItem, Tabs } from './tabs';

@Component({
  imports: [Tabs],
  template: `<ui-tabs label="Categorias" [tabs]="tabs" [(selected)]="selected" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly tabs: TabItem[] = [
    { id: 'mx1', label: 'MX1' },
    { id: 'mx2', label: 'MX2' },
    { id: 'fem', label: 'Feminino' },
  ];
  readonly selected = signal('mx2');
}

describe('Tabs', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    return { fixture, tabs, host: fixture.componentInstance };
  }

  it('marca só a aba selecionada e só ela entra no Tab do teclado', async () => {
    const { tabs } = await setup();
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('clique atualiza o valor do pai (two-way binding)', async () => {
    const { fixture, tabs, host } = await setup();
    tabs[2].click();
    await fixture.whenStable();
    expect(host.selected()).toBe('fem');
  });

  it('setas navegam com volta circular; Home/End vão às pontas', async () => {
    const { fixture, tabs, host } = await setup();
    const press = async (key: string) => {
      // A tecla nasce na aba que está com foco (a ativa), como acontece com o teclado de verdade.
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true')!;
      active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await fixture.whenStable();
    };
    await press('ArrowRight');
    expect(host.selected()).toBe('fem');
    await press('ArrowRight');
    expect(host.selected()).toBe('mx1');
    await press('ArrowLeft');
    expect(host.selected()).toBe('fem');
    await press('Home');
    expect(host.selected()).toBe('mx1');
    await press('End');
    expect(host.selected()).toBe('fem');
  });
});
