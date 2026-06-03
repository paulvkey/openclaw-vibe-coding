# Async FIFO (Cummings-style)

A parameterizable asynchronous FIFO written in Verilog, implementing the
classic two-flop gray-coded pointer synchronization scheme described in
Clifford Cummings' SNUG 2002 paper.

## Files

| Path | Purpose |
| --- | --- |
| `rtl/async_fifo.v` | Synthesizable RTL for the dual-clock FIFO |
| `tb/async_fifo_tb.v` | Self-checking Verilog testbench |

## Parameters

| Name | Default | Description |
| --- | --- | --- |
| `DATA_WIDTH` | 8 | Width of each FIFO entry, in bits |
| `ADDR_WIDTH` | 4 | log2(depth); default depth = 16 entries |

## Interface

### Write port (clocked by `wclk`)
| Signal | Dir | Description |
| --- | --- | --- |
| `wrst_n` | in  | Active-low async reset for the write domain |
| `wen`    | in  | Write enable (ignored when `wfull`) |
| `wdata`  | in  | Write data, `DATA_WIDTH` bits |
| `wfull`  | out | Asserts when the FIFO cannot accept more data |

### Read port (clocked by `rclk`)
| Signal | Dir | Description |
| --- | --- | --- |
| `rrst_n` | in  | Active-low async reset for the read domain |
| `ren`    | in  | Read enable (ignored when `rempty`) |
| `rdata`  | out | Read data, `DATA_WIDTH` bits |
| `rempty` | out | Asserts when the FIFO has no data to read |

## Design Notes

1. **Pointer width.** Both binary and gray pointers are `ADDR_WIDTH+1` bits.
   The extra MSB lets full and empty be disambiguated when the lower bits
   match.
2. **Gray coding.** Pointers are converted to gray code (`bin ^ (bin >> 1)`)
   before crossing the clock boundary. Gray code guarantees only one bit
   changes per increment, which keeps the synchronizer's sampled value
   either the old or new pointer, never a corrupted intermediate.
3. **Two-flop synchronizers.** Each pointer crosses through two back-to-back
   flip-flops in the destination domain to flush metastability.
4. **Full detection (write domain).** The FIFO is full when the next write
   gray pointer equals the synchronized read gray pointer with the top two
   bits inverted (i.e., one wrap ahead).
5. **Empty detection (read domain).** The FIFO is empty when the next read
   gray pointer equals the synchronized write gray pointer.
6. **Memory.** Inferred dual-port RAM with synchronous write and async read
   on the registered read pointer. Most FPGA tools map this to BRAM/LUTRAM.

## Simulation

With Icarus Verilog:

```bash
iverilog -o sim.out rtl/async_fifo.v tb/async_fifo_tb.v
vvp sim.out
```

The testbench drives writes at 100 MHz and reads at ~66.67 MHz, mirrors
every write into a reference array, and checks that reads return values in
FIFO order. The console prints `RESULT: PASS` or `RESULT: FAIL` at the end.

A waveform dump (`async_fifo_tb.vcd`) is produced for inspection in
GTKWave.

## Reference

Clifford E. Cummings, *Simulation and Synthesis Techniques for Asynchronous
FIFO Design*, SNUG 2002.
