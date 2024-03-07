# Audit smart contracts
Guideline for internally auditing smart contracts.

## Prerequisites
* [Conda latest version](https://conda.io/projects/conda/en/latest/user-guide/install/index.html)

## Slither
* (Optional) Create virtual env python3.10 for slither
```
$ conda create -n slither python=3.10
$ conda activate slither
```

* (Optional) Install Slither
```
$ pip install slither-analyzer
```

* (Optional) Install xdot
```
$ sudo apt install xdot
```

* Run analyze smart contracts
```
$ slither .
$ slither-check-erc . <contract-name>
$ slither . --print human-summary
$ slither . --print contract-summary
$ slither . --print inheritance-graph
```
and many other printer as your need.

* (Optional) View dot file
```
$ xdot <file>.dot
```