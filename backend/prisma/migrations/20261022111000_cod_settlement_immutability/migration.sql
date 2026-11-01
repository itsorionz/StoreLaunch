CREATE FUNCTION reject_cod_settlement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COD settlement evidence cannot be changed';
END;
$$;
CREATE TRIGGER "CodSettlement_append_only" BEFORE UPDATE OR DELETE ON "CodSettlement"
  FOR EACH ROW EXECUTE FUNCTION reject_cod_settlement_mutation();
CREATE TRIGGER "CodSettlementLine_append_only" BEFORE UPDATE OR DELETE ON "CodSettlementLine"
  FOR EACH ROW EXECUTE FUNCTION reject_cod_settlement_mutation();
