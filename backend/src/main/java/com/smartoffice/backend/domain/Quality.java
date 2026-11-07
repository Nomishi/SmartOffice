package com.smartoffice.backend.domain;

public enum Quality {
    VALID, SUSPECT, INVALID;

    /** Mức xấu nhất trong 1 bản tin: INVALID > SUSPECT > VALID. */
    public static Quality worst(Quality a, Quality b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.ordinal() > b.ordinal() ? a : b;
    }
}
