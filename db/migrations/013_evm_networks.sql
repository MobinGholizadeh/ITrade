ALTER TABLE portfolio_connections DROP CONSTRAINT portfolio_connections_kind_check;
ALTER TABLE portfolio_connections ADD CONSTRAINT portfolio_connections_kind_check CHECK(kind IN('manual','ethereum','base','arbitrum','optimism','solana','kraken'));
