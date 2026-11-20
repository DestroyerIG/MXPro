import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(ToastService);
  });
  afterEach(() => vi.useRealTimers());

  it('mostra e some sozinho depois de 5 s', () => {
    service.show('Volta registrada');
    expect(service.toasts().map((t) => t.message)).toEqual(['Volta registrada']);
    vi.advanceTimersByTime(4999);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
  });

  it('mantém no máximo 3 na tela, descartando os mais antigos', () => {
    ['a', 'b', 'c', 'd'].forEach((m) => service.show(m));
    expect(service.toasts().map((t) => t.message)).toEqual(['b', 'c', 'd']);
  });

  it('executa a ação (ex.: Desfazer) e fecha o toast', () => {
    const run = vi.fn();
    const id = service.show('Volta registrada', { action: { label: 'Desfazer', run } });
    service.runAction(id);
    expect(run).toHaveBeenCalledOnce();
    expect(service.toasts()).toHaveLength(0);
  });

  it('fechar manualmente cancela o temporizador', () => {
    const id = service.show('x');
    service.dismiss(id);
    vi.advanceTimersByTime(10_000);
    expect(service.toasts()).toHaveLength(0);
  });
});
