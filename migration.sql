
CREATE TABLE transactions (
        id INTEGER NOT NULL, 
        timestamp INTEGER, 
        member_id INTEGER, 
        price INTEGER, 
        type VARCHAR, 
        description VARCHAR, 
        outcome VARCHAR, 
        PRIMARY KEY (id)
);

alter table members add address varchar;
alter table members add branch_code varchar;
alter table members add account_number varchar;
alter table members add debit_order_signup_timestamp integer;

alter table entries add gym_id integer;
alter table daily_passes add gym_id integer;
