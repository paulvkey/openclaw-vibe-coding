// =============================================================================
// async_fifo.v
// Asynchronous FIFO with Gray-coded pointers and double-flop synchronizers.
// Reference: Clifford E. Cummings, "Simulation and Synthesis Techniques for
// Asynchronous FIFO Design", SNUG 2002.
//
// - Two clock domains:
//     write side: wclk / wrst_n
//     read  side: rclk / rrst_n
// - Pointers are (ADDR_WIDTH+1) bits: the extra MSB lets the same low bits
//   be distinguished as either "empty" (pointers equal) or "full" (write
//   pointer wrapped one extra time relative to read pointer).
// - Gray-coded versions of the pointers cross the clock-domain boundary and
//   are resynchronized through 2-flop synchronizers, ensuring at most one
//   bit flip is in flight at any time (metastability protection).
// =============================================================================

`default_nettype none

module async_fifo #(
    parameter integer DATA_WIDTH = 8,
    parameter integer ADDR_WIDTH = 4
) (
    // Write port
    input  wire                  wclk,
    input  wire                  wrst_n,
    input  wire                  wen,
    input  wire [DATA_WIDTH-1:0] wdata,
    output wire                  wfull,

    // Read port
    input  wire                  rclk,
    input  wire                  rrst_n,
    input  wire                  ren,
    output wire [DATA_WIDTH-1:0] rdata,
    output wire                  rempty
);

    wire [ADDR_WIDTH:0]   wptr;        // gray write pointer (wclk domain)
    wire [ADDR_WIDTH:0]   rptr;        // gray read  pointer (rclk domain)
    wire [ADDR_WIDTH:0]   wq2_rptr;    // rptr synchronized into wclk domain
    wire [ADDR_WIDTH:0]   rq2_wptr;    // wptr synchronized into rclk domain
    wire [ADDR_WIDTH-1:0] waddr;       // binary write address into memory
    wire [ADDR_WIDTH-1:0] raddr;       // binary read  address from memory

    sync_r2w #(.ADDR_WIDTH(ADDR_WIDTH)) u_sync_r2w (
        .wclk    (wclk),
        .wrst_n  (wrst_n),
        .rptr    (rptr),
        .wq2_rptr(wq2_rptr)
    );

    sync_w2r #(.ADDR_WIDTH(ADDR_WIDTH)) u_sync_w2r (
        .rclk    (rclk),
        .rrst_n  (rrst_n),
        .wptr    (wptr),
        .rq2_wptr(rq2_wptr)
    );

    fifomem #(
        .DATA_WIDTH(DATA_WIDTH),
        .ADDR_WIDTH(ADDR_WIDTH)
    ) u_fifomem (
        .wclk  (wclk),
        .wclken(wen),
        .wfull (wfull),
        .waddr (waddr),
        .wdata (wdata),
        .raddr (raddr),
        .rdata (rdata)
    );

    rptr_empty #(.ADDR_WIDTH(ADDR_WIDTH)) u_rptr_empty (
        .rclk    (rclk),
        .rrst_n  (rrst_n),
        .rinc    (ren),
        .rq2_wptr(rq2_wptr),
        .rempty  (rempty),
        .raddr   (raddr),
        .rptr    (rptr)
    );

    wptr_full #(.ADDR_WIDTH(ADDR_WIDTH)) u_wptr_full (
        .wclk    (wclk),
        .wrst_n  (wrst_n),
        .winc    (wen),
        .wq2_rptr(wq2_rptr),
        .wfull   (wfull),
        .waddr   (waddr),
        .wptr    (wptr)
    );

endmodule


// -----------------------------------------------------------------------------
// fifomem: dual-port RAM, synchronous write, asynchronous read
// -----------------------------------------------------------------------------
module fifomem #(
    parameter integer DATA_WIDTH = 8,
    parameter integer ADDR_WIDTH = 4
) (
    input  wire                  wclk,
    input  wire                  wclken,
    input  wire                  wfull,
    input  wire [ADDR_WIDTH-1:0] waddr,
    input  wire [DATA_WIDTH-1:0] wdata,
    input  wire [ADDR_WIDTH-1:0] raddr,
    output wire [DATA_WIDTH-1:0] rdata
);
    localparam integer DEPTH = 1 << ADDR_WIDTH;

    reg [DATA_WIDTH-1:0] mem [0:DEPTH-1];

    assign rdata = mem[raddr];

    always @(posedge wclk) begin
        if (wclken && !wfull) mem[waddr] <= wdata;
    end
endmodule


// -----------------------------------------------------------------------------
// sync_r2w: 2-flop synchronizer for the read-pointer (gray) into wclk domain
// -----------------------------------------------------------------------------
module sync_r2w #(
    parameter integer ADDR_WIDTH = 4
) (
    input  wire                wclk,
    input  wire                wrst_n,
    input  wire [ADDR_WIDTH:0] rptr,
    output reg  [ADDR_WIDTH:0] wq2_rptr
);
    reg [ADDR_WIDTH:0] wq1_rptr;

    always @(posedge wclk or negedge wrst_n) begin
        if (!wrst_n) {wq2_rptr, wq1_rptr} <= 0;
        else         {wq2_rptr, wq1_rptr} <= {wq1_rptr, rptr};
    end
endmodule


// -----------------------------------------------------------------------------
// sync_w2r: 2-flop synchronizer for the write-pointer (gray) into rclk domain
// -----------------------------------------------------------------------------
module sync_w2r #(
    parameter integer ADDR_WIDTH = 4
) (
    input  wire                rclk,
    input  wire                rrst_n,
    input  wire [ADDR_WIDTH:0] wptr,
    output reg  [ADDR_WIDTH:0] rq2_wptr
);
    reg [ADDR_WIDTH:0] rq1_wptr;

    always @(posedge rclk or negedge rrst_n) begin
        if (!rrst_n) {rq2_wptr, rq1_wptr} <= 0;
        else         {rq2_wptr, rq1_wptr} <= {rq1_wptr, wptr};
    end
endmodule


// -----------------------------------------------------------------------------
// rptr_empty: read-side binary + gray pointer, empty flag generation
// rempty is asserted when the next gray read pointer equals the synchronized
// gray write pointer.
// -----------------------------------------------------------------------------
module rptr_empty #(
    parameter integer ADDR_WIDTH = 4
) (
    input  wire                  rclk,
    input  wire                  rrst_n,
    input  wire                  rinc,
    input  wire [ADDR_WIDTH:0]   rq2_wptr,
    output reg                   rempty,
    output wire [ADDR_WIDTH-1:0] raddr,
    output reg  [ADDR_WIDTH:0]   rptr
);
    reg  [ADDR_WIDTH:0] rbin;
    wire [ADDR_WIDTH:0] rbinnext, rgraynext;
    wire                rempty_val;

    always @(posedge rclk or negedge rrst_n) begin
        if (!rrst_n) {rbin, rptr} <= 0;
        else         {rbin, rptr} <= {rbinnext, rgraynext};
    end

    assign raddr     = rbin[ADDR_WIDTH-1:0];
    assign rbinnext  = rbin + (rinc & ~rempty);
    assign rgraynext = (rbinnext >> 1) ^ rbinnext;

    assign rempty_val = (rgraynext == rq2_wptr);

    always @(posedge rclk or negedge rrst_n) begin
        if (!rrst_n) rempty <= 1'b1;
        else         rempty <= rempty_val;
    end
endmodule


// -----------------------------------------------------------------------------
// wptr_full: write-side binary + gray pointer, full flag generation
// wfull is asserted when the next gray write pointer equals the synchronized
// gray read pointer with the two MSBs inverted (the standard Cummings test).
// -----------------------------------------------------------------------------
module wptr_full #(
    parameter integer ADDR_WIDTH = 4
) (
    input  wire                  wclk,
    input  wire                  wrst_n,
    input  wire                  winc,
    input  wire [ADDR_WIDTH:0]   wq2_rptr,
    output reg                   wfull,
    output wire [ADDR_WIDTH-1:0] waddr,
    output reg  [ADDR_WIDTH:0]   wptr
);
    reg  [ADDR_WIDTH:0] wbin;
    wire [ADDR_WIDTH:0] wbinnext, wgraynext;
    wire                wfull_val;

    always @(posedge wclk or negedge wrst_n) begin
        if (!wrst_n) {wbin, wptr} <= 0;
        else         {wbin, wptr} <= {wbinnext, wgraynext};
    end

    assign waddr     = wbin[ADDR_WIDTH-1:0];
    assign wbinnext  = wbin + (winc & ~wfull);
    assign wgraynext = (wbinnext >> 1) ^ wbinnext;

    assign wfull_val = (wgraynext == {~wq2_rptr[ADDR_WIDTH:ADDR_WIDTH-1],
                                       wq2_rptr[ADDR_WIDTH-2:0]});

    always @(posedge wclk or negedge wrst_n) begin
        if (!wrst_n) wfull <= 1'b0;
        else         wfull <= wfull_val;
    end
endmodule

`default_nettype wire
