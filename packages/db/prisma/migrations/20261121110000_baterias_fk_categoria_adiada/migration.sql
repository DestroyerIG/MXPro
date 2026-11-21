-- A ligação bateria ↔ categoria do evento passa a ser conferida no FIM da transação.
--
-- Motivo: ao excluir um evento inteiro, o Postgres executa as cascatas em sequência e conferia
-- "categoria usada em bateria" antes de apagar as baterias, bloqueando uma exclusão válida.
-- Adiada, a regra continua valendo: tirar do evento uma categoria que ainda está numa bateria
-- é recusado (no commit), mas apagar o evento com tudo dentro funciona.
ALTER TABLE "heat_categories"
  ALTER CONSTRAINT "heat_categories_event_category_id_event_id_fkey" DEFERRABLE INITIALLY DEFERRED;
