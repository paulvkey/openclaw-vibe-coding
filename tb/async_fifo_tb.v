// =============================================================================
// async_fifo_tb.v
// Self-checking testbench for async_fifo.
// - Generates two unrelated clocks (wclk faster than rclk)
// - Test 1: write N values, read them back, verify ordering and content
// - Test 2: fill the FIFO completely, verify wfull
// - Test 3: drain the FIFO completely, verify rempty
// - Test 4: concurrent producer/consumer at different rates
// =============================================================================

`timescale 1ns/1ps
`default_nettype none

module async_fifo_tb;

    parameter integer DATA_WIDTH = 8;
    parameter integer ADDR_WIDTH = 4;
    localparam integer DEPTH     = 1 << ADDR_WIDTH;

    // ---------------- DUT signals ----------------
    reg                   wclk;
    reg                   rclk;
    reg                   wrst_n;
    reg                   rrst_n;
    reg                   wen;
    reg                   ren;
    reg  [DATA_WIDTH-1:0] wdata;
    wire [DATA_WIDTH-1:0] rdata;
    wire                  wfull;
    wire                  rempty;

    // ---------------- Test bookkeeping ----------------
    integer errors;
    integer i;
    integer wq_idx;
    integer rq_idx;
    reg [DATA_WIDTH-1:0] expected_q [0:1023];

    // ---------------- Clocks ----------------
    // wclk = 50 MHz (T = 20 ns)
    // rclk = 33.3 MHz (T = 30 ns)  -> writer is faster
    initial wclk = 1'b0;
    initial rclk = 1'b0;
    always  #10 wclk = ~wclk;
    always  #15 rclk = ~rclk;

    // ---------------- DUT ----------------
    async_fifo #(
        .DATA_WIDTH(DATA_WIDTH),
        .ADDR_WIDTH(ADDR_WIDTH)
    ) dut (
        .wclk  (wclk),
        .wrst_n(wrst_n),
        .wen   (wen),
        .wdata (wdata),
        .wfull (wfull),
        .rclk  (rclk),
        .rrst_n(rrst_n),
        .ren   (ren),
        .rdata (rdata),
        .rempty(rempty)
    );

    // ---------------- Reset ----------------
    task apply_reset;
        begin
            wrst_n = 1'b0;
            rrst_n = 1'b0;
            wen    = 1'b0;
            ren    = 1'b0;
            wdata  = {DATA_WIDTH{1'b0}};
            #100;
            @(posedge wclk) wrst_n = 1'b1;
            @(posedge rclk) rrst_n = 1'b1;
            #50;
        end
    endtask

    // ---------------- Stimulus tasks ----------------
    task automatic write_word(input [DATA_WIDTH-1:0] d);
        begin
            @(posedge wclk);
            while (wfull) @(posedge wclk);
            wen   <= 1'b1;
            wdata <= d;
            @(posedge wclk);
            wen   <= 1'b0;
            expected_q[wq_idx] = d;
            wq_idx = wq_idx + 1;
        end
    endtask

    task automatic read_word(output [DATA_WIDTH-1:0] d);
        begin
            @(posedge rclk);
            while (rempty) @(posedge rclk);
            ren <= 1'b1;
            @(posedge rclk);
            d    = rdata;     // captured BEFORE NBA region updates rptr
            ren <= 1'b0;
        end
    endtask

    // ---------------- Tests ----------------
    task test_basic;
        integer n;
        reg [DATA_WIDTH-1:0] got;
        integer fails_before;
        begin
            n = DEPTH - 1;
            fails_before = errors;
            $display("[T1] basic write/read of %0d values", n);
            for (i = 0; i < n; i = i + 1) write_word(8'h10 + i[7:0]);
            repeat (8) @(posedge rclk);
            for (i = 0; i < n; i = i + 1) begin
                read_word(got);
                if (got !== expected_q[rq_idx]) begin
                    $display("[T1][FAIL] idx=%0d expected=%02h got=%02h",
                             i, expected_q[rq_idx], got);
                    errors = errors + 1;
                end
                rq_idx = rq_idx + 1;
            end
            if (errors == fails_before)
                $display("[T1][PASS] all %0d words match", n);
        end
    endtask

    task test_full;
        integer n;
        integer fails_before;
        begin
            fails_before = errors;
            n = DEPTH; // exactly fills
            $display("[T2] fill to FULL (%0d words) and check wfull", n);
            for (i = 0; i < n; i = i + 1) write_word(8'hA0 + i[7:0]);
            repeat (3) @(posedge wclk);
            if (!wfull) begin
                $display("[T2][FAIL] wfull not asserted after %0d writes", n);
                errors = errors + 1;
            end
            if (errors == fails_before)
                $display("[T2][PASS] wfull asserted after fill");
        end
    endtask

    task test_drain;
        integer n;
        reg [DATA_WIDTH-1:0] got;
        integer fails_before;
        begin
            fails_before = errors;
            n = wq_idx - rq_idx;
            $display("[T3] drain %0d words and check rempty", n);
            for (i = 0; i < n; i = i + 1) begin
                read_word(got);
                if (got !== expected_q[rq_idx]) begin
                    $display("[T3][FAIL] idx=%0d expected=%02h got=%02h",
                             i, expected_q[rq_idx], got);
                    errors = errors + 1;
                end
                rq_idx = rq_idx + 1;
            end
            repeat (4) @(posedge rclk);
            if (!rempty) begin
                $display("[T3][FAIL] rempty not asserted after drain");
                errors = errors + 1;
            end
            if (errors == fails_before)
                $display("[T3][PASS] rempty asserted after drain");
        end
    endtask

    // ---------------- Main ----------------
    integer j;
    reg [DATA_WIDTH-1:0] got_main;
    integer total;
    integer fails_before_t4;

    initial begin
        errors = 0;
        wq_idx = 0;
        rq_idx = 0;

        apply_reset();

        test_basic();
        test_full();
        test_drain();

        // T4: concurrent writer + reader (writer is faster, so FIFO will
        // sometimes back-pressure on wfull and sometimes hold the reader on
        // rempty).
        total = 64;
        fails_before_t4 = errors;
        $display("[T4] concurrent writer/reader, %0d words", total);
        fork
            begin : writer_proc
                integer wi;
                for (wi = 0; wi < total; wi = wi + 1)
                    write_word(8'h40 + wi[7:0]);
            end
            begin : reader_proc
                for (j = 0; j < total; j = j + 1) begin
                    read_word(got_main);
                    if (got_main !== expected_q[rq_idx]) begin
                        $display("[T4][FAIL] j=%0d expected=%02h got=%02h",
                                 j, expected_q[rq_idx], got_main);
                        errors = errors + 1;
                    end
                    rq_idx = rq_idx + 1;
                end
            end
        join
        if (errors == fails_before_t4)
            $display("[T4][PASS] %0d concurrent words match", total);

        repeat (10) @(posedge rclk);

        $display("");
        if (errors == 0)
            $display("========== ALL TESTS PASSED ==========");
        else
            $display("========== %0d ERRORS ==========", errors);

        $finish;
    end

    // Safety timeout
    initial begin
        #500000;
        $display("[TIMEOUT] simulation exceeded time limit, errors=%0d", errors);
        $finish;
    end

endmodule

`default_nettype wire
