SET Z, 0xFFFF
SET X, 0
:loop1
    SET A, 0x5000
    SET B, 1
    SHL B, X
    BOR [A], B
    ADD X, 2
    IFL X, 16
       SET PC, loop1
SET X, 0
:loop2
    SET A, 0x5002
    SET B, 1
    SHL B, X
    BOR [A], B
    ADD X, 2
    IFL X, 16
       SET PC, loop2