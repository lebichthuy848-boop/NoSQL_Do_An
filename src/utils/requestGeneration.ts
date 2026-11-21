export class RequestGeneration {
  private generation = 0;

  next() {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number) {
    return generation === this.generation;
  }

  invalidate() {
    this.generation += 1;
  }
}
